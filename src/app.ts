import dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import cors from 'cors';
import express, { Application } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { accountsRouter } from './routers/accountsRouter';

export const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(compression({ threshold: 1024 }));
app.use(cookieParser());

// cors policy
if (process.env.NODE_ENV?.toLowerCase() === 'development') {
  app.use(
    cors({
      origin: (origin: string | undefined, callback) => {
        if (!origin) {
          return callback(null, false);
        }

        if (/^http:\/\/192\.168\.0\.\d{2}:(3000|5000)$/.test(origin)) {
          return callback(null, true);
        }

        return callback(null, false);
      },
      credentials: true,
    })
  );
}

// CSP
app.use((req, res, next) => {
  res.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; connect-src 'self';`
  );
  next();
});

// static files
app.use(express.static(path.join(__dirname, '../client/dist')));

// rate limiter

// routes
app.use('/api/accounts', accountsRouter);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});
