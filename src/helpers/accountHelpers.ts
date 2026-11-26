import { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { logUnexpectedError } from '../logs/errorLogger';
import { Request, Response } from 'express';
import {
  ACCOUNT_EMAILS_SENT_LIMIT,
  ACCOUNT_FAILED_ATTEMPTS_LIMIT,
  ACCOUNT_FAILED_SIGN_IN_LIMIT,
} from '../util/constants/accountConstants';
import { purgeAuthSessionsHelper } from './authHelpers';
import { removeRequestCookie } from '../util/cookieUtils';

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

export async function incrementFailedAccountRequestAttemptsHelper(
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
        failed_attempts = LEAST(?, failed_attempts + 1)
      WHERE
        request_id = ?;`,
      [ACCOUNT_FAILED_ATTEMPTS_LIMIT, requestId]
    );

    const incremented: boolean = resultSetHeader.affectedRows > 0;

    if (!incremented) {
      await logUnexpectedError({
        err: null,
        req,
        helperName: incrementFailedAccountRequestAttemptsHelper.name,
        description: `Failed to increment failed_attempts for ${tableName}.`,
      });
    }

    return incremented;
  } catch (err: unknown) {
    console.log(err);

    await logUnexpectedError({
      err,
      req,
      helperName: incrementFailedAccountRequestAttemptsHelper.name,
      description: `Failed to increment failed_attempts for ${tableName}.`,
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
  const { accountId } = data;

  try {
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

    if (!accountVerified) {
      await logUnexpectedError({
        err: null,
        req,
        helperName: verifyAccountHelper.name,
        description: 'Failed to verify account..',
      });
    }

    return accountVerified;
  } catch (err: unknown) {
    console.log(err);

    await logUnexpectedError({
      err,
      req,
      helperName: verifyAccountHelper.name,
      description: 'Failed to verify account..',
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
  const { accountId } = data;

  try {
    const [resultSetHeader] = await executor.execute<ResultSetHeader>(
      `DELETE FROM
        accounts
      WHERE
        account_id = ?;`,
      [accountId]
    );

    const accountDeleted: boolean = resultSetHeader.affectedRows > 0;

    if (!accountDeleted) {
      await logUnexpectedError({
        err: null,
        req,
        helperName: deleteAccountHelper.name,
        description: 'Failed to delete account.',
      });
    }

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

export async function handleIncorrectPasswordHelper(
  executor: Pool,
  req: Request,
  res: Response,
  data: {
    accountId: number;
    failedSignInAttempts: number;
  }
): Promise<void> {
  const { accountId, failedSignInAttempts } = data;

  try {
    const incremented: boolean = await incrementFailedSignInAttemptsHelper(
      accountId,
      executor,
      req
    );
    const hasBeenLocked: boolean =
      failedSignInAttempts + 1 >= ACCOUNT_FAILED_SIGN_IN_LIMIT && incremented;

    if (hasBeenLocked) {
      removeRequestCookie(res, 'authSessionId');
      await purgeAuthSessionsHelper(executor, req, { accountId });
    }

    res.status(401).json({
      message: `Incorrect password.${hasBeenLocked ? ' Account locked.' : ''}`,
      reason: hasBeenLocked ? 'incorrectPassword_locked' : 'incorrectPassword',
    });
  } catch (err: unknown) {
    console.log(err);

    if (res.headersSent) {
      await logUnexpectedError({
        err,
        req,
        helperName: handleIncorrectPasswordHelper.name,
        description: 'Attempted to send two responses.',
      });

      return;
    }

    res.status(500).json({ message: 'Internal server error.' });

    await logUnexpectedError({
      err,
      req,
      helperName: handleIncorrectPasswordHelper.name,
    });
  }
}

export async function incrementFailedSignInAttemptsHelper(
  accountId: number,
  executor: Pool | PoolConnection,
  req: Request
): Promise<boolean> {
  try {
    const [resultSetHeader] = await executor.execute<ResultSetHeader>(
      `UPDATE
        accounts
      SET
        failed_sign_in_attempts = LEAST(?, failed_sign_in_attempts + 1)
      WHERE
        account_id = ?;`,
      [ACCOUNT_FAILED_SIGN_IN_LIMIT, accountId]
    );

    const incremented: boolean = resultSetHeader.affectedRows > 0;

    if (!incremented) {
      await logUnexpectedError({
        err: null,
        req,
        helperName: incrementFailedSignInAttemptsHelper.name,
        description: 'Failed to increment failed_sign_in_attempts.',
      });
    }

    return incremented;
  } catch (err: unknown) {
    console.log(err);

    await logUnexpectedError({
      err,
      req,
      helperName: incrementFailedSignInAttemptsHelper.name,
    });

    return false;
  }
}
