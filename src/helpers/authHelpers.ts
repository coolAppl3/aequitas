import { Request, Response } from 'express';
import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { setResponseCookie } from '../util/cookieUtils';
import { dayMilliseconds, hourMilliseconds } from '../util/constants/globalConstants';
import { AUTH_SESSIONS_LIMIT } from '../util/constants/authConstants';
import { generateCryptoUuid } from '../util/randomGenerator';
import { generatePlaceHolders, isSqlError } from '../util/sql/sqlUtils';
import { logUnexpectedError } from '../logs/errorLogger';

export async function createAuthSessionHelper(
  executor: PoolConnection,
  req: Request,
  res: Response,
  data: {
    accountId: number;
    keepSignedIn: boolean;
  },
  attemptCount: number = 1
): Promise<boolean> {
  if (attemptCount > 3) {
    await logUnexpectedError({
      err: null,
      req,
      helperName: createAuthSessionHelper.name,
      description: 'Failed to create a unique session_id 3 times in a row.',
    });

    return false;
  }

  const { accountId, keepSignedIn } = data;

  const newAuthSessionId: string = generateCryptoUuid();
  const currentTimestamp: number = Date.now();

  const maxAge: number | undefined = keepSignedIn ? dayMilliseconds * 7 : undefined;
  const expiryTimestamp: number = currentTimestamp + (maxAge ? maxAge : hourMilliseconds * 6);

  try {
    type SessionDetails = {
      session_id: string;
      created_on_timestamp: number;
    };

    const [sessionRows] = await executor.execute<RowDataPacket[]>(
      `SELECT
        session_id,
        created_on_timestamp
      FROM
        auth_sessions
      WHERE
        account_id = ?
      LIMIT
        ${AUTH_SESSIONS_LIMIT}
      FOR UPDATE;`,
      [accountId]
    );

    if (sessionRows.length < 3) {
      await executor.execute(
        `INSERT INTO auth_sessions (
          session_id,
          account_id,
          created_on_timestamp,
          expiry_timestamp,
          keep_signed_in,
          extensions_count
        ) VALUES (${generatePlaceHolders(6)});`,
        [newAuthSessionId, accountId, currentTimestamp, expiryTimestamp, keepSignedIn, 0]
      );

      setResponseCookie(res, 'authSessionId', newAuthSessionId, maxAge, true);
      return true;
    }

    const oldestAuthSession: SessionDetails = (sessionRows as SessionDetails[]).reduce(
      (oldest: SessionDetails, current: SessionDetails) => {
        if (current.created_on_timestamp < oldest.created_on_timestamp) {
          return current;
        }

        return oldest;
      },
      sessionRows[0] as SessionDetails
    );

    const [resultSetHeader] = await executor.execute<ResultSetHeader>(
      `UPDATE
        auth_sessions
      SET
        session_id = ?,
        created_on_timestamp = ?,
        expiry_timestamp = ?,
        extensions_count = ?
      WHERE
        session_id = ?;`,
      [newAuthSessionId, currentTimestamp, expiryTimestamp, 0, oldestAuthSession.session_id]
    );

    if (resultSetHeader.affectedRows === 0) {
      await logUnexpectedError({
        err: null,
        req,
        helperName: createAuthSessionHelper.name,
        description: 'Failed to update auth_session row.',
      });

      return false;
    }

    setResponseCookie(res, 'authSessionId', newAuthSessionId, maxAge, true);
    return true;
  } catch (err: unknown) {
    console.log(err);

    if (!isSqlError(err)) {
      await logUnexpectedError({ err, req, helperName: createAuthSessionHelper.name });
      return false;
    }

    if (err.errno === 1062 && err.sqlMessage?.endsWith(`for key 'PRIMARY'`)) {
      return await createAuthSessionHelper(
        executor,
        req,
        res,
        { accountId, keepSignedIn },
        ++attemptCount
      );
    }

    await logUnexpectedError({ err, req, helperName: createAuthSessionHelper.name });
    return false;
  }
}

export async function purgeAuthSessionsHelper(
  executor: Pool,
  req: Request,
  data: {
    accountId: number;
    authSessionIdToExclude?: string;
  }
): Promise<void> {
  const { accountId, authSessionIdToExclude } = data;

  try {
    await executor.execute(
      `DELETE FROM
        auth_sessions
      WHERE
        account_id = ? ${authSessionIdToExclude ? `AND session_id != ${authSessionIdToExclude}` : ''}
      LIMIT ${AUTH_SESSIONS_LIMIT};`,
      [accountId]
    );
  } catch (err: unknown) {
    console.log(err);

    await logUnexpectedError({
      err,
      req,
      helperName: purgeAuthSessionsHelper.name,
    });
  }
}
