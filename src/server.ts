import http, { IncomingMessage } from 'http';
import { app } from './app';
import { Socket } from 'net';

const port: number = process.env.PORT ? +process.env.PORT : 5000;
const server = http.createServer(app);

async function initServer(): Promise<void> {
  try {
    // TODO: init db
    // TODO: init cron jobs

    server.listen(port, () => {
      console.log(`Server running on port ${port}.`);
    });
  } catch (err: unknown) {
    console.log(err);
    process.exit(1);
  }
}

initServer();
