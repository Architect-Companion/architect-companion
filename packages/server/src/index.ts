import { buildApp, HOST, PORT } from "./app.js";

const app = buildApp();

try {
  await app.listen({ host: HOST, port: PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
