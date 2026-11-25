import { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { logUnexpectedError } from '../logs/errorLogger';
import { Request } from 'express';
import { ACCOUNT_EMAILS_SENT_LIMIT } from '../util/constants/accountConstants';

type AccountRequestTables =
  | 'account_verification'
  | 'account_recovery'
  | 'account_deletion'
  | 'email_update';

export async function incrementAccountRequestEmailsSentHelper(
  executor: Pool | PoolConnection,
  req: Request,
  data: {
    tableName: AccountRequestTables;
    requestId: number;
  }
): Promise<boolean> {
  const { tableName, requestId } = data;

  try {
    const [resultSetHeader] = await executor.execute<ResultSetHeader>(
      `UPDATE
        ${tableName}
      SET
        emails_sent = LEAST(?, emails_sent + 1)
      WHERE
        request_id = ?;`,
      [ACCOUNT_EMAILS_SENT_LIMIT, requestId]
    );

    const incremented: boolean = resultSetHeader.affectedRows > 0;

    if (!incremented) {
      await logUnexpectedError({
        err: null,
        req,
        helperName: incrementAccountRequestEmailsSentHelper.name,
        description: `Failed to increment emails_sent for ${tableName}.`,
      });
    }

    return incremented;
  } catch (err: unknown) {
    console.log(err);

    await logUnexpectedError({
      err,
      req,
      helperName: incrementAccountRequestEmailsSentHelper.name,
      description: `Failed to increment emails_sent for ${tableName}.`,
    });

    return false;
  }
}

export async function verifyAccountHelper(
  executor: Pool | PoolConnection,
  req: Request,
  data: {
    accountId: number;
  }
): Promise<boolean> {
  try {
    const { accountId } = data;

    const [resultSetHeader] = await executor.execute<ResultSetHeader>(
      `UPDATE
          accounts
        SET
          is_verified = ?
        WHERE
          account_id = ?;`,
      [true, accountId]
    );

    const accountVerified: boolean = resultSetHeader.affectedRows > 0;
    return accountVerified;
  } catch (err: unknown) {
    console.log(err);

    await logUnexpectedError({
      err,
      req,
      helperName: verifyAccountHelper.name,
      description: 'Failed to delete account.',
    });

    return false;
  }
}

export async function deleteAccountHelper(
  executor: Pool | PoolConnection,
  req: Request,
  data: {
    accountId: number;
  }
): Promise<boolean> {
  try {
    const { accountId } = data;

    const [resultSetHeader] = await executor.execute<ResultSetHeader>(
      `DELETE FROM
        accounts
      WHERE
        account_id = ?;`,
      [accountId]
    );

    const accountDeleted: boolean = resultSetHeader.affectedRows > 0;
    return accountDeleted;
  } catch (err: unknown) {
    console.log(err);

    await logUnexpectedError({
      err,
      req,
      helperName: deleteAccountHelper.name,
      description: 'Failed to delete account.',
    });

    return false;
  }
}
