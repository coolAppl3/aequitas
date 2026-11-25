import { Request } from 'express';
import { dbPool } from '../db/db';
import { generatePlaceHolders } from '../util/sql/sqlUtils';

type LogUnexpectedErrorData = {
  err: unknown;
  req?: Request;
  serviceName?: string;
  helperName?: string;
  description?: string;
};

export async function logUnexpectedError(errorData: LogUnexpectedErrorData): Promise<void> {
  const { err, req, serviceName, helperName, description } = errorData;

  const currentTimestamp: number = Date.now();
  const { message, stack } = getErrorData(err);

  try {
    await dbPool.execute(
      `INSERT INTO unexpected_errors (
        error_timestamp,
        request_path,
        request_method,
        service_name,
        helper_name,
        error_message,
        error_stack,
        description
      ) VALUES (${generatePlaceHolders(8)});`,
      [
        currentTimestamp,
        req?.method || null,
        req?.originalUrl || null,
        serviceName || null,
        helperName || null,
        message || null,
        stack || null,
        description || null,
      ]
    );
  } catch (err: unknown) {
    console.log(err);
  }
}

function getErrorData(err: unknown): { message: string | null; stack: string | null } {
  const errorData: { message: string | null; stack: string | null } = {
    message: null,
    stack: null,
  };

  if (typeof err !== 'object' || err === null) {
    return errorData;
  }

  if ('message' in err && typeof err.message === 'string') {
    errorData.message = err.message;
  }

  if ('stack' in err && typeof err.stack === 'string') {
    errorData.stack = err.stack;
  }

  return errorData;
}
