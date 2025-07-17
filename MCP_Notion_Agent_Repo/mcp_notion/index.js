#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@notionhq/client";
import { z } from "zod";

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const server = new Server(
  {
    name: "notion-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Tool argument schemas
const SearchPagesSchema = z.object({
  query: z.string().optional(),
  page_size: z.number().max(100).default(10),
});

const CreatePageSchema = z.object({
  parent_id: z.string(),
  title: z.string(),
  content: z.string().optional(),
});

const ReadPageSchema = z.object({
  page_id: z.string(),
});

const UpdatePageSchema = z.object({
  page_id: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
});

const CreateDatabaseSchema = z.object({
  parent_id: z.string(),
  title: z.string(),
  properties: z.record(z.any()),
});

const QueryDatabaseSchema = z.object({
  database_id: z.string(),
  filter: z.any().optional(),
  sorts: z.array(z.any()).optional(),
  page_size: z.number().max(100).default(10),
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_pages",
        description: "Search for pages in Notion workspace",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (optional)",
            },
            page_size: {
              type: "number",
              description: "Number of results to return (max 100)",
              default: 10,
            },
          },
        },
      },
      {
        name: "create_page",
        description: "Create a new page in Notion",
        inputSchema: {
          type: "object",
          properties: {
            parent_id: {
              type: "string",
              description: "Parent page or database ID",
            },
            title: {
              type: "string",
              description: "Page title",
            },
            content: {
              type: "string",
              description: "Page content (optional)",
            },
          },
          required: ["parent_id", "title"],
        },
      },
      {
        name: "read_page",
        description: "Read a specific page from Notion",
        inputSchema: {
          type: "object",
          properties: {
            page_id: {
              type: "string",
              description: "Page ID to read",
            },
          },
          required: ["page_id"],
        },
      },
      {
        name: "update_page",
        description: "Update an existing page in Notion",
        inputSchema: {
          type: "object",
          properties: {
            page_id: {
              type: "string",
              description: "Page ID to update",
            },
            title: {
              type: "string",
              description: "New page title (optional)",
            },
            content: {
              type: "string",
              description: "New page content (optional)",
            },
          },
          required: ["page_id"],
        },
      },
      {
        name: "create_database",
        description: "Create a new database in Notion",
        inputSchema: {
          type: "object",
          properties: {
            parent_id: {
              type: "string",
              description: "Parent page ID",
            },
            title: {
              type: "string",
              description: "Database title",
            },
            properties: {
              type: "object",
              description: "Database properties schema",
            },
          },
          required: ["parent_id", "title", "properties"],
        },
      },
      {
        name: "query_database",
        description: "Query a Notion database",
        inputSchema: {
          type: "object",
          properties: {
            database_id: {
              type: "string",
              description: "Database ID to query",
            },
            filter: {
              type: "object",
              description: "Filter criteria (optional)",
            },
            sorts: {
              type: "array",
              description: "Sort criteria (optional)",
            },
            page_size: {
              type: "number",
              description: "Number of results to return (max 100)",
              default: 10,
            },
          },
          required: ["database_id"],
        },
      },
    ],
  };
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "notion://workspaces",
        mimeType: "application/json",
        name: "Notion Workspaces",
        description: "List all accessible Notion workspaces",
      },
    ],
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "notion://workspaces") {
    try {
      const response = await notion.users.me();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to fetch workspaces: ${error}`);
    }
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_pages": {
        const { query, page_size } = SearchPagesSchema.parse(args);
        const searchParams = { page_size };
        
        if (query) {
          searchParams.query = query;
        }

        const response = await notion.search(searchParams);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "create_page": {
        const { parent_id, title, content } = CreatePageSchema.parse(args);
        
        const properties = {
          title: {
            title: [
              {
                text: {
                  content: title,
                },
              },
            ],
          },
        };

        const children = [];
        if (content) {
          children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: content,
                  },
                },
              ],
            },
          });
        }

        const response = await notion.pages.create({
          parent: { page_id: parent_id },
          properties,
          children,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "read_page": {
        const { page_id } = ReadPageSchema.parse(args);
        
        const [page, blocks] = await Promise.all([
          notion.pages.retrieve({ page_id }),
          notion.blocks.children.list({ block_id: page_id }),
        ]);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ page, blocks }, null, 2),
            },
          ],
        };
      }

      case "update_page": {
        const { page_id, title, content } = UpdatePageSchema.parse(args);
        
        const properties = {};
        if (title) {
          properties.title = {
            title: [
              {
                text: {
                  content: title,
                },
              },
            ],
          };
        }

        const response = await notion.pages.update({
          page_id,
          properties,
        });

        // If content is provided, we need to update the blocks
        if (content) {
          // First, get existing blocks
          const existingBlocks = await notion.blocks.children.list({
            block_id: page_id,
          });

          // Delete existing blocks
          for (const block of existingBlocks.results) {
            await notion.blocks.delete({ block_id: block.id });
          }

          // Add new content
          await notion.blocks.children.append({
            block_id: page_id,
            children: [
              {
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [
                    {
                      type: "text",
                      text: {
                        content: content,
                      },
                    },
                  ],
                },
              },
            ],
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "create_database": {
        const { parent_id, title, properties } = CreateDatabaseSchema.parse(args);
        
        const response = await notion.databases.create({
          parent: { page_id: parent_id },
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
          properties,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "query_database": {
        const { database_id, filter, sorts, page_size } = QueryDatabaseSchema.parse(args);
        
        const queryParams = { database_id, page_size };
        if (filter) queryParams.filter = filter;
        if (sorts) queryParams.sorts = sorts;

        const response = await notion.databases.query(queryParams);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Notion MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});