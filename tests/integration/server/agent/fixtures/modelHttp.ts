import { createServer, type RequestListener, type Server } from "node:http";
import { test as base } from "vitest";

type ModelHttp = (handler: RequestListener) => Promise<string>;

// Own the listening socket before user setup can fail, including openSession.
// The model protocol is supplied by each case; HTTP stays real.
export const it = base.extend<{ modelHttp: ModelHttp }>({
  modelHttp: async ({}, use) => {
    const servers: Server[] = [];
    try {
      await use(async (handler) => {
        const server = createServer(handler);
        servers.push(server);
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => {
            server.off("error", reject);
            resolve();
          });
        });
        const address = server.address();
        if (!address || typeof address === "string")
          throw new Error("Missing model server port");
        return `http://127.0.0.1:${address.port}`;
      });
    } finally {
      const results = await Promise.allSettled(
        servers.map((server) => {
          if (!server.listening) return Promise.resolve();
          return new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
          });
        }),
      );
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (errors.length) throw errors[0];
    }
  },
});
