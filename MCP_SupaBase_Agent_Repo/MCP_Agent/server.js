import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Simple stdio handling
process.stdin.setEncoding('utf-8');
let buffer = '';

process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  let newlineIndex;
  
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    
    if (line.trim()) {
      try {
        const request = JSON.parse(line.trim());
        await handleRequest(request);
      } catch (error) {
        console.error('Parse error:', error);
      }
    }
  }
});

async function handleRequest(request) {
  if (request.method === 'initialize') {
    console.log(JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "task-manager", version: "1.0.0" }
      }
    }));
  } 
  else if (request.method === 'tools/list') {
    console.log(JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: [
          {
            name: "get_tasks",
            description: "Get tasks with optional filtering",
            inputSchema: {
              type: "object",
              properties: {
                status: { type: "string", description: "Filter by status (todo, in_progress, completed, blocked)" },
                priority: { type: "integer", description: "Filter by priority (1-5)" },
                limit: { type: "integer", description: "Maximum number of tasks to return" }
              },
              additionalProperties: false
            }
          },
          {
            name: "create_task",
            description: "Create a new task",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", description: "Task title" },
                description: { type: "string", description: "Task description" },
                status: { type: "string", description: "Task status" },
                priority: { type: "integer", description: "Priority (1-5)" },
                due_date: { type: "string", description: "Due date (YYYY-MM-DD)" }
              },
              required: ["title"],
              additionalProperties: false
            }
          },
          {
            name: "update_task",
            description: "Update an existing task",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "integer", description: "Task ID" },
                title: { type: "string", description: "New title" },
                description: { type: "string", description: "New description" },
                status: { type: "string", description: "New status" },
                priority: { type: "integer", description: "New priority" },
                due_date: { type: "string", description: "New due date" }
              },
              required: ["id"],
              additionalProperties: false
            }
          },
          {
            name: "get_task_stats",
            description: "Get statistics about tasks",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: "search_tasks",
            description: "Search tasks by title or description",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "Search query" }
              },
              required: ["query"],
              additionalProperties: false
            }
          }
        ]
      }
    }));
  }
  else if (request.method === 'tools/call') {
    const toolName = request.params.name;
    const args = request.params.arguments || {};
    
    try {
      let result;
      
      if (toolName === 'get_tasks') {
        result = await getTasks(args);
      }
      else if (toolName === 'create_task') {
        result = await createTask(args);
      }
      else if (toolName === 'update_task') {
        result = await updateTask(args);
      }
      else if (toolName === 'get_task_stats') {
        result = await getTaskStats();
      }
      else if (toolName === 'search_tasks') {
        result = await searchTasks(args);
      }
      else {
        throw new Error(`Unknown tool: ${toolName}`);
      }
      
      console.log(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{ type: "text", text: result }]
        }
      }));
    } catch (error) {
      console.log(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -1, message: error.message }
      }));
    }
  }
}

async function getTasks(args) {
  const { status, priority, limit = 50 } = args;
  
  let query = supabase.from('tasks').select('*');
  
  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  
  query = query.limit(limit).order('created_at', { ascending: false });
  
  const { data, error } = await query;
  if (error) throw error;
  
  return `Found ${data.length} tasks:\n${JSON.stringify(data, null, 2)}`;
}

async function createTask(args) {
  const { title, description, status = 'todo', priority = 1, due_date } = args;
  
  if (!title) throw new Error('Title is required');
  
  const { data, error } = await supabase
    .from('tasks')
    .insert({ title, description, status, priority, due_date })
    .select()
    .single();
    
  if (error) throw error;
  
  return `Created task: "${data.title}" (ID: ${data.id})`;
}

async function updateTask(args) {
  const { id, ...updates } = args;
  
  if (!id) throw new Error('Task ID is required');
  
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;
  
  return `Updated task: "${data.title}" (ID: ${data.id})`;
}

async function getTaskStats() {
  const { count: total } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true });

  const { data: statusData } = await supabase.from('tasks').select('status');
  
  const statusCounts = {};
  statusData?.forEach(task => {
    statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
  });

  const stats = {
    total: total || 0,
    by_status: statusCounts
  };
  
  return `Task Statistics:\n${JSON.stringify(stats, null, 2)}`;
}

async function searchTasks(args) {
  const { query } = args;
  
  if (!query) throw new Error('Search query is required');
  
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .limit(20);
    
  if (error) throw error;
  
  return `Found ${data.length} tasks matching "${query}":\n${JSON.stringify(data, null, 2)}`;
}

console.error("Enhanced task manager ready");