# 💡 Generated Schema Capabilities

[🔙 Back to Main README](../README.md)

This document details the core capabilities and performance optimizations provided by the Pothos Drizzle Generator, ensuring efficient and reliable data interaction through your GraphQL API.

## Optimized Data Retrieval (Solving N+1 Problem)

One of the primary goals of this generator is to eliminate the notorious N+1 problem inherent in many ORM-GraphQL integrations. Our `findMany` and `findFirst` operations are meticulously engineered for both performance and flexibility.

- **Deep Filtering, Sorting & Limiting**: You gain unparalleled control over your data. You are not just limited to filtering the root node of your query; you can apply specific `where` clauses, `limit` the number of results, and define `orderBy` arguments **to any related field deep within the graph structure**. This allows clients to request exactly the data they need, precisely shaped, and efficiently retrieved.

- **Single Query Execution**: At its core, the generator tackles the N+1 problem by intelligently consolidating complex data requirements. It transforms your GraphQL query into a **single, highly optimized SQL query**. This is achieved through advanced techniques utilizing Drizzle ORM's powerful capabilities, including complex `JOIN` operations and, crucially, `LATERAL JOIN` (or equivalent subqueries depending on the database and Drizzle's optimization), which are specifically designed to fetch a main resource, its related records, and even aggregated counts in a single round trip to the database. This significantly reduces database load and network overhead.

**Benefits**:

- **Superior Performance**: Drastically reduces the number of database queries.
- **Reduced Latency**: Faster response times for complex data requests.
- **Simplified Client Logic**: Clients can express complex data requirements in a single GraphQL query without needing multiple requests or client-side aggregation.

**Example Query:**
_Fetching a list of users, and for each user, retrieving only their 'published' posts, ordered by creation date, limited to the 5 most recent._

```graphql
query {
  findManyUser(
    where: { isActive: { eq: true } } # Filter root 'User' nodes
    orderBy: { name: asc }
  ) {
    id
    name
    email
    # Deeply filter, sort, and limit related 'posts' records
    posts(
      where: { published: { eq: true }, category: { name: { contains: "Tech" } } } # Filter related posts
      orderBy: { createdAt: desc } # Order related posts
      limit: 5 # Limit related posts
    ) {
      id
      title
      createdAt
      published
      category {
        # Nested relation
        name
      }
    }
    # Fetch a count of all posts for each user
    _count {
      posts # Get count of all posts (published or not)
    }
  }
}
```

In this example, `findManyUser` will fetch active users, and for each user, it will execute a highly optimized subquery to get their published posts that also contain "Tech" in their category name, limited to 5 and sorted. All of this happens in a single, efficient database call.

## Transactional Mutations

Data integrity is paramount, especially when dealing with write operations that involve multiple related entities. Our mutation operations are designed to ensure atomicity and consistency by automatically wrapping complex operations within database transactions.

- **Atomic Operations**: When you perform a mutation that involves creating, updating, or deleting a record and its associated related data (e.g., creating a `Post` along with its `Categories` and `Tags`), the entire process is treated as a single, indivisible unit of work. All database modifications for that mutation either succeed completely or fail completely.

- **Consistency & Rollback**: If any part of the intricate mutation process encounters an error – be it a validation failure, a database constraint violation, or an unexpected server-side issue – the entire transaction is automatically rolled back. This means any changes that were partially applied to the database are undone, preventing corrupted or orphaned data and leaving your database in a consistent state as if the operation never occurred.

**Benefits**:

- **Guaranteed Data Integrity**: Ensures your database remains consistent, even in the face of complex operations or errors.
- **Simplified Error Handling**: Clients don't need to implement complex rollback logic for partial failures.
- **Reliable API**: Provides a more robust and trustworthy API for data manipulation.

**Example Mutation:**
_Creating a new Post with a title and content, and simultaneously associating it with existing categories (via `set`) and creating new tags (via `create`)._

```graphql
mutation {
  createOnePost(
    input: {
      title: "Exploring GraphQL Transactions"
      content: "This article delves into the power of transactional mutations."
      published: true
      # Automatically handles many-to-many relation with existing categories
      categories: {
        set: [
          { id: "clsw8l9c600003b6w503t42v1" } # Link to existing category by ID
        ]
      }
      # Automatically handles one-to-many relation by creating new tags
      tags: { create: [{ name: "GraphQL" }, { name: "Database" }, { name: "Transactions" }] }
    }
  ) {
    id
    title
    published
    categories {
      id
      name
    }
    tags {
      id
      name
    }
  }
}
```

In this mutation, if the post creation succeeds but any of the category associations or tag creations fail (e.g., due to a constraint or an invalid ID), the entire `createOnePost` operation will be rolled back, ensuring no partial data is committed.

---

## 🔍 Supported Features Checklist

This section provides a quick overview of the capabilities exposed through the generated GraphQL schema.

### Operations

The generator automatically creates a comprehensive set of CRUD operations for each configured Drizzle model:

- **Queries**:
  - `findMany[ModelName]`: Retrieves a list of records for a given model. Supports advanced filtering, sorting, limiting, and pagination.
  - `findFirst[ModelName]`: Retrieves a single record for a given model, typically by a unique identifier.
  - `count[ModelName]`: Returns the total number of records for a given model, optionally applying `where` clauses.

- **Mutations**:
  - `createOne[ModelName]`: Creates a single new record. Supports nested creation and connection to related entities.
  - `createMany[ModelName]`: Creates multiple new records in a single operation. Supports nested creation and connection to related entities.
  - `update[ModelName]`: Updates one or more existing records based on a `where` clause. Supports nested updates.
  - `delete[ModelName]`: Deletes one or more existing records based on a `where` clause.

### Advanced Filtering (`where` clauses)

The `where` input argument, available on all query and update/delete mutation types, provides powerful and flexible filtering capabilities. It supports a wide range of operators, allowing you to construct complex conditions.

- **Logical Operators**: Combine conditions with Boolean logic.
  - `AND`: All conditions must be true.
  - `OR`: At least one condition must be true.
  - `NOT`: Negates a single condition.
  - _Example_: `where: { AND: [{ published: { eq: true } }, { authorId: { eq: "some-id" } }] }`

- **Comparators**: Standard comparison operators for various data types.
  - `eq`: Equal to. _Example_: `{ id: { eq: "uuid-123" } }`
  - `ne`: Not equal to. _Example_: `{ status: { ne: "archived" } }`
  - `gt`: Greater than. _Example_: `{ age: { gt: 18 } }`
  - `gte`: Greater than or equal to. _Example_: `{ price: { gte: 9.99 } }`
  - `lt`: Less than. _Example_: `{ stock: { lt: 100 } }`
  - `lte`: Less than or equal to. _Example_: `{ endDate: { lte: "2024-12-31" } }`
  - `in`: Value is within a list of values. _Example_: `{ role: { in: ["admin", "editor"] } }`
  - `notIn`: Value is not within a list of values. _Example_: `{ country: { notIn: ["US", "CA"] } }`

- **Existence Checks**: For nullable fields.
  - `isNull`: Field's value is NULL. _Example_: `{ completedAt: { isNull: true } }`
  - `isNotNull`: Field's value is NOT NULL. _Example_: `{ publishedAt: { isNotNull: true } }`

- **String Matching**: For text-based comparisons.
  - `like`: Case-sensitive pattern matching (uses SQL `LIKE`). _Example_: `{ name: { like: "%john%" } }`
  - `notLike`: Case-sensitive pattern non-matching. _Example_: `{ title: { notLike: "Draft%" } }`
  - `ilike`: Case-insensitive pattern matching (uses SQL `ILIKE`, if supported by DB). _Example_: `{ email: { ilike: "user@example.com" } }`
  - `notIlike`: Case-insensitive pattern non-matching. _Example_: `{ bio: { notIlike: "%private%" } }`

- **Array Operations (for PostgreSQL array columns)**:
  - `arrayContained`: Checks if the array column is contained within the provided array. _Example_: `{ tags: { arrayContained: ["featured"] } }`
  - `arrayOverlaps`: Checks if the array column overlaps with the provided array. _Example_: `{ permissions: { arrayOverlaps: ["read", "write"] } }`
  - `arrayContains`: Checks if the array column contains the provided array. _Example_: `{ categories: { arrayContains: ["news", "updates"] } }`
