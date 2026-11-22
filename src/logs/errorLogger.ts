import { Request } from 'express';
import { dbPool } from '../db/db';
import { generatePlaceHolders } from '../util/sql/sqlUtils';

export async function logUnexpectedError(
  req: Request | null,
  err: unknown,
  serviceName: string | null = null,
  description: string | null = null
): Promise<void> {
  const currentTimestamp: number = Date.now();
  const { message, stack } = getErrorData(err);

  try {
    await dbPool.execute(
      `INSERT INTO unexpected_errors (
        request_path,
        request_method,
        service_name,
        error_timestamp,
        error_message,
        error_stack,
        description
      ) VALUES (${generatePlaceHolders(6)});`,
      [
        req && req.method,
        req && req.originalUrl,
        serviceName,
        currentTimestamp,
        message,
        stack,
        description,
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
