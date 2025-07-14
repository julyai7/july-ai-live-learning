#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for admin operations

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Sample data for demo
const sampleTasks = [
  {
    title: "Design new homepage layout",
    description: "Create wireframes and mockups for the company website redesign",
    status: "in_progress",
    priority: 4,
    due_date: "2024-07-15",
    tags: ["design", "website", "urgent"]
  },
  {
    title: "Implement user authentication",
    description: "Add JWT-based authentication system with login/logout functionality",
    status: "todo",
    priority: 5,
    due_date: "2024-07-20",
    tags: ["backend", "security", "authentication"]
  },
  {
    title: "Write API documentation",
    description: "Document all REST endpoints with examples and response formats",
    status: "todo",
    priority: 3,
    due_date: "2024-07-25",
    tags: ["documentation", "api"]
  },
  {
    title: "Set up CI/CD pipeline",
    description: "Configure GitHub Actions for automated testing and deployment",
    status: "completed",
    priority: 4,
    due_date: "2024-06-30",
    tags: ["devops", "automation", "ci-cd"]
  },
  {
    title: "Database migration scripts",
    description: "Create migration scripts for the new user table schema",
    status: "blocked",
    priority: 3,
    due_date: "2024-07-10",
    tags: ["database", "migration", "backend"]
  },
  {
    title: "Mobile app prototype",
    description: "Build interactive prototype for the mobile companion app",
    status: "in_progress",
    priority: 5,
    due_date: "2024-08-01",
    tags: ["mobile", "prototype", "design"]
  },
  {
    title: "Performance optimization",
    description: "Optimize database queries and implement caching for better response times",
    status: "todo",
    priority: 2,
    due_date: "2024-07-30",
    tags: ["performance", "database", "optimization"]
  },
  {
    title: "Security audit",
    description: "Conduct comprehensive security review of the application",
    status: "todo",
    priority: 5,
    due_date: "2024-07-12",
    tags: ["security", "audit", "urgent"]
  },
  {
    title: "Unit test coverage",
    description: "Increase unit test coverage to at least 80% for critical components",
    status: "in_progress",
    priority: 3,
    due_date: "2024-07-22",
    tags: ["testing", "quality-assurance"]
  },
  {
    title: "Customer feedback analysis",
    description: "Analyze recent customer feedback and create improvement roadmap",
    status: "completed",
    priority: 2,
    due_date: "2024-06-28",
    tags: ["analysis", "customer-feedback", "planning"]
  },
  {
    title: "Email notification system",
    description: "Implement email notifications for important user actions and reminders",
    status: "todo",
    priority: 3,
    due_date: "2024-08-05",
    tags: ["backend", "notifications", "email"]
  },
  {
    title: "Dark mode implementation",
    description: "Add dark mode toggle with persistent user preference storage",
    status: "todo",
    priority: 1,
    due_date: "2024-08-10",
    tags: ["frontend", "ui", "accessibility"]
  },
  {
    title: "Load testing",
    description: "Perform load testing to ensure system can handle 10k concurrent users",
    status: "todo",
    priority: 4,
    due_date: "2024-07-18",
    tags: ["testing", "performance", "scalability"]
  },
  {
    title: "Backup strategy implementation",
    description: "Set up automated daily backups with disaster recovery procedures",
    status: "completed",
    priority: 5,
    due_date: "2024-06-25",
    tags: ["backup", "disaster-recovery", "devops"]
  },
  {
    title: "Internationalization setup",
    description: "Prepare application for multi-language support starting with Spanish and French",
    status: "todo",
    priority: 2,
    due_date: "2024-08-15",
    tags: ["i18n", "localization", "frontend"]
  }
];

async function setupDatabase() {
  console.log("Setting up task manager database in Supabase...");
  
  try {
    // Clear existing data
    console.log("Clearing existing data...");
    await supabase.from('task_tags').delete().neq('task_id', 0);
    await supabase.from('tasks').delete().neq('id', 0);
    await supabase.from('tags').delete().neq('id', 0);

    // Insert sample tasks and collect tag names
    console.log("Inserting sample tasks...");
    const allTags = new Set();
    
    // First collect all unique tags
    sampleTasks.forEach(task => {
      if (task.tags) {
        task.tags.forEach(tag => allTags.add(tag));
      }
    });

    // Insert all tags first
    console.log("Creating tags...");
    const tagsToInsert = Array.from(allTags).map(name => ({ name }));
    const { data: insertedTags, error: tagsError } = await supabase
      .from('tags')
      .insert(tagsToInsert)
      .select();

    if (tagsError) {
      throw new Error(`Failed to insert tags: ${tagsError.message}`);
    }

    // Create a map of tag names to IDs
    const tagMap = {};
    insertedTags.forEach(tag => {
      tagMap[tag.name] = tag.id;
    });

    // Insert tasks
    console.log("Creating tasks...");
    for (const task of sampleTasks) {
      const { title, description, status, priority, due_date, tags } = task;
      
      // Insert task
      const { data: insertedTask, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title,
          description,
          status,
          priority,
          due_date
        })
        .select()
        .single();

      if (taskError) {
        throw new Error(`Failed to insert task "${title}": ${taskError.message}`);
      }

      // Link tags to task
      if (tags && tags.length > 0) {
        const taskTagLinks = tags.map(tagName => ({
          task_id: insertedTask.id,
          tag_id: tagMap[tagName]
        }));

        const { error: linkError } = await supabase
          .from('task_tags')
          .insert(taskTagLinks);

        if (linkError) {
          console.warn(`Failed to link tags for task "${title}": ${linkError.message}`);
        }
      }
    }

    // Display summary
    const { count: taskCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true });

    const { count: tagCount } = await supabase
      .from('tags')
      .select('*', { count: 'exact', head: true });
    
    console.log(`✅ Database setup complete!`);
    console.log(`📝 Created ${taskCount} tasks`);
    console.log(`🏷️  Created ${tagCount} unique tags`);
    console.log(`☁️ Data stored in Supabase`);
    
    // Show some sample queries
    console.log('\n📊 Sample data overview:');
    
    const { data: statusCounts } = await supabase
      .from('tasks')
      .select('status');
    
    const statusSummary = {};
    statusCounts.forEach(task => {
      statusSummary[task.status] = (statusSummary[task.status] || 0) + 1;
    });
    
    Object.entries(statusSummary).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} tasks`);
    });
    
    const { data: urgentTasks } = await supabase
      .from('tasks')
      .select('id')
      .gte('priority', 4);
    
    console.log(`🚨 High priority tasks (4-5): ${urgentTasks.length}`);
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setupDatabase();