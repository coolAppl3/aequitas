import { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { logUnexpectedError } from '../logs/errorLogger';
import { generatePlaceHolders, isSqlError } from '../util/sql/sqlUtils';
import { Request, Response } from 'express';

async function createAccountService(
  executor: PoolConnection,
  req: Request,
  res: Response,
  data: {
    publicAccountId: number;
    dateOfBirthTimestamp: number;
    email: string;
    hashedPassword: string;
    username: string;
    displayName: string;
    createdOnTimestamp: number;
  }
): Promise<number | null> {
  const {
    publicAccountId,
    dateOfBirthTimestamp,
    email,
    hashedPassword,
    username,
    displayName,
    createdOnTimestamp,
  } = data;

  try {
    const [resultSetHeader] = await executor.execute<ResultSetHeader>(
      `INSERT INTO accounts (
        public_account_id,
        date_of_birth_timestamp,
        email,
        hashed_password,
        username,
        display_name,
        created_on_timestamp,
        is_verified,
        failed_sign_in_attempts
      ) VALUES (${generatePlaceHolders(9)});`,
      [
        publicAccountId,
        dateOfBirthTimestamp,
        email,
        hashedPassword,
        username,
        displayName,
        createdOnTimestamp,
        false,
        0,
      ]
    );

    const accountId: number = resultSetHeader.insertId;
    return accountId;
  } catch (err: unknown) {
    console.log(err);

    if (res.headersSent) {
      await logUnexpectedError(req, err, 'Attempted to send two responses.');
      return null;
    }

    if (!isSqlError(err)) {
      res.status(500).json({ message: 'Internal server error.' });
      logUnexpectedError(req, err);

      return null;
    }

    if (err.errno === 1062 && err.sqlMessage?.endsWith(`for key 'email'`)) {
      res.status(409).json({ message: 'Email is taken.', reason: 'emailTaken' });
      return null;
    }

    if (err.errno === 1062 && err.sqlMessage?.endsWith(`for key 'username'`)) {
      res.status(409).json({ message: 'Username is taken.', reason: 'usernameTaken' });
      return null;
    }

    res.status(500).json({ message: 'Internal server error.' });
    await logUnexpectedError(req, err, createAccountService.name);

    return null;
  }
}
