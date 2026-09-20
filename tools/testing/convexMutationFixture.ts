import type { MutationCtx } from "../../convex/_generated/server";

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type Range = { eq: (field: string, value: unknown) => Range };

/** Indexed read/write adapter for handler tests; not a Convex runtime emulator. */
export function mutationFixture() {
  const tables = new Map<string, Map<string, Row>>();
  const scheduled: { delay: number; args: Record<string, unknown> }[] = [];
  let subject: string | null = "commissioner";
  let nextId = 0;
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  const rows = (name: string) => [...table(name).values()];
  const put = (name: string, id: string, value: Record<string, unknown>) => {
    table(name).set(id, { ...value, _id: id, _creationTime: 1 });
  };
  const get = (id: string) => {
    for (const entries of tables.values()) {
      const value = entries.get(id);
      if (value) return value;
    }
    return null;
  };
  put("authUsers", "commissioner", {
    role: "commissioner",
    status: "active",
    email: "test@example.invalid",
  });
  const ctx = {
    auth: { getUserIdentity: async () => (subject ? { subject } : null) },
    db: {
      get: async (id: string) => get(id),
      query: (name: string) => {
        const predicates: ((row: Row) => boolean)[] = [];
        const select = () =>
          rows(name).filter((row) => predicates.every((match) => match(row)));
        const query = {
          withIndex: (
            _name: string,
            selectRange: (range: Range) => unknown,
          ) => {
            const range: Range = {
              eq: (field, value) => {
                predicates.push((row) => row[field] === value);
                return range;
              },
            };
            selectRange(range);
            return query;
          },
          filter: (
            expression: (q: {
              field: (name: string) => string;
              lte: (field: string, value: number) => (row: Row) => boolean;
            }) => (row: Row) => boolean,
          ) => {
            predicates.push(
              expression({
                field: (field) => field,
                lte: (field, value) => (row) => Number(row[field]) <= value,
              }),
            );
            return query;
          },
          collect: async () => select(),
          first: async () => select()[0] ?? null,
          unique: async () => {
            const matches = select();
            if (matches.length > 1) throw new Error("Expected a unique row");
            return matches[0] ?? null;
          },
          take: async (count: number) => select().slice(0, count),
        };
        return query;
      },
      insert: async (name: string, value: Record<string, unknown>) => {
        const id = name + ":" + ++nextId;
        put(name, id, value);
        return id;
      },
      patch: async (id: string, value: Record<string, unknown>) => {
        const row = get(id);
        if (!row) throw new Error("Missing row: " + id);
        Object.assign(row, value);
        for (const key of Object.keys(value))
          if (value[key] === undefined) delete row[key];
      },
    },
    scheduler: {
      runAfter: async (
        delay: number,
        _fn: unknown,
        args: Record<string, unknown>,
      ) => {
        scheduled.push({ delay, args });
        return "scheduled:" + scheduled.length;
      },
    },
  } as unknown as MutationCtx;
  return {
    ctx,
    put,
    get,
    rows,
    scheduled,
    signIn: (value: string | null) => {
      subject = value;
    },
  };
}

export async function invokeMutation(
  fn: unknown,
  ctx: MutationCtx,
  args: Record<string, unknown>,
) {
  return (
    fn as {
      _handler: (
        ctx: MutationCtx,
        args: Record<string, unknown>,
      ) => Promise<unknown>;
    }
  )._handler(ctx, args);
}
