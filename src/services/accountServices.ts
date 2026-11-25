import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { logUnexpectedError } from '../logs/errorLogger';
import { generatePlaceHolders, isSqlError } from '../util/sql/sqlUtils';
import { Request, Response } from 'express';
import {
  ACCOUNT_FAILED_ATTEMPTS_LIMIT,
  ACCOUNT_VERIFICATION_WINDOW,
} from '../util/constants/accountConstants';
import { deleteAccountHelper } from '../helpers/accountHelpers';

export async function checkEmailOrUsernameTakenService(
  executor: PoolConnection,
  req: Request,
  res: Response,
  data: {
    email: string;
    username: string;
  }
): Promise<boolean> {
  try {
    const { email, username } = data;

    type TakenStatus = {
      email_taken: boolean;
      email_temporarily_taken: boolean;
      username_taken: boolean;
    };

    const [takenStatusRows] = await executor.execute<RowDataPacket[]>(
      `SELECT
        EXISTS (SELECT 1 FROM accounts WHERE email = :email FOR UPDATE) AS email_taken,
        EXISTS (SELECT 1 FROM email_update WHERE new_email = :email FOR UPDATE) AS email_temporarily_taken,
        EXISTS (SELECT 1 FROM accounts WHERE username = :username FOR UPDATE) AS username_taken
      `,
      { email, username }
    );

    const takenStatus = takenStatusRows[0] as TakenStatus | undefined;

    if (!takenStatus) {
      res.status(500).json({ message: 'Internal server error.' });
      await logUnexpectedError({
        err: null,
        req,
        serviceName: checkEmailOrUsernameTakenService.name,
        description: 'Failed to fetch taken status.',
      });

      return true;
    }

    if (takenStatus.email_taken || takenStatus.email_temporarily_taken) {
      res.status(409).json({ message: 'Email is taken.', reason: 'emailTaken' });
      return true;
    }

    if (takenStatus.username_taken) {
      res.status(409).json({ message: 'Username is taken.', reason: 'usernameTaken' });
      return true;
    }

    return false;
  } catch (err: unknown) {
    console.log(err);

    if (res.headersSent) {
      await logUnexpectedError({
        err,
        req,
        description: 'Attempted to send two responses.',
      });
      return true;
    }

    res.status(500).json({ message: 'Internal server error.' });
    await logUnexpectedError({
      err,
      req,
      serviceName: checkEmailOrUsernameTakenService.name,
    });

    return true;
  }
}

export async function createAccountService(
  executor: PoolConnection,
  req: Request,
  res: Response,
  data: {
    publicAccountId: string;
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
      await logUnexpectedError({
        err,
        req,
        description: 'Attempted to send two responses.',
      });
      return null;
    }

    if (!isSqlError(err)) {
      res.status(500).json({ message: 'Internal server error.' });
      await logUnexpectedError({ err, req });

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
    await logUnexpectedError({
      err,
      req,
      serviceName: createAccountService.name,
    });

    return null;
  }
}

export async function createAccountVerificationRequestService(
  executor: PoolConnection,
  req: Request,
  res: Response,
  data: {
    accountId: number;
    currentTimestamp: number;
    verificationToken: string;
  }
): Promise<boolean> {
  try {
    const { accountId, currentTimestamp, verificationToken } = data;
    const verificationExpiryTimestamp: number = currentTimestamp + ACCOUNT_VERIFICATION_WINDOW;

    await executor.execute(
      `INSERT INTO account_verification (
        account_id,
        verification_token,
        emails_sent,
        failed_attempts,
        expiry_timestamp
      ) VALUES (${generatePlaceHolders(5)});`,
      [accountId, verificationToken, 1, 0, verificationExpiryTimestamp]
    );

    return true;
  } catch (err: unknown) {
    console.log(err);

    if (res.headersSent) {
      await logUnexpectedError({
        err,
        req,
        description: 'Attempted to send two responses.',
      });
      return false;
    }

    res.status(500).json({ message: 'Internal server error.' });
    await logUnexpectedError({
      err,
      req,
      serviceName: createAccountVerificationRequestService.name,
    });

    return false;
  }
}

export async function continueAccountVerificationRequestService(
  executor: Pool,
  req: Request,
  res: Response,
  data: {
    email: string;
  }
): Promise<string | null> {
  try {
    const { email } = data;

    type AccountDetails = {
      public_account_id: string;
      is_verified: boolean;
      verification_request_exists: boolean;
    };

    const [accountRows] = await executor.execute<RowDataPacket[]>(
      `SELECT
        accounts.public_account_id,
        accounts.is_verified,

        EXISTS (
          SELECT 1 FROM account_verification WHERE account_id = accounts.account_id
        ) AS verification_request_exists
      FROM
        accounts
      WHERE
        email = ?;`,
      [email]
    );

    const accountDetails = accountRows[0] as AccountDetails | undefined;

    if (
      !accountDetails ||
      accountDetails.is_verified ||
      !accountDetails.verification_request_exists
    ) {
      res
        .status(404)
        .json({ message: 'Verification request not found.', reason: 'requestNotFound' });
      return null;
    }

    return accountDetails.public_account_id;
  } catch (err: unknown) {
    console.log(err);

    if (res.headersSent) {
      await logUnexpectedError({
        err,
        req,
        description: 'Attempted to send two responses.',
      });
      return null;
    }

    res.status(500).json({ message: 'Internal server error.' });
    await logUnexpectedError({
      err,
      req,
      serviceName: continueAccountVerificationRequestService.name,
    });

    return null;
  }
}

export type FindAccountVerificationRequestServiceReturnType = {
  accountId: number;
  email: string;
  displayName: string;
  verificationRequestId: number;
  verificationToken: string;
  verificationEmailsSent: number;
  failedVerificationAttempts: number;
};

export async function findAccountVerificationRequestService(
  executor: PoolConnection,
  req: Request,
  res: Response,
  data: { publicAccountId: string }
): Promise<FindAccountVerificationRequestServiceReturnType | null> {
  try {
    const { publicAccountId } = data;

    type AccountDetails = {
      account_id: number;
      public_account_id: string;
      email: string;
      display_name: string;
      is_verified: boolean;
    } & (
      | {
          verification_request_id: number;
          verification_token: string;
          emails_sent: number;
          failed_attempts: number;
        }
      | {
          verification_request_id: null;
          verification_token: null;
          emails_sent: null;
          failed_attempts: null;
        }
    );

    const [accountRows] = await executor.execute<RowDataPacket[]>(
      `SELECT
        accounts.account_id,
        accounts.public_account_id,
        accounts.email,
        accounts.display_name,
        accounts.is_verified,

        account_verification.request_id AS verification_request_id,
        account_verification.verification_token,
        account_verification.emails_sent,
        account_verification.failed_attempts
      FROM
        accounts
      LEFT JOIN
        account_verification USING(account_id)
      WHERE
        accounts.public_account_id = ?
      FOR UPDATE;`,
      [publicAccountId]
    );

    const accountDetails = accountRows[0] as AccountDetails | undefined;

    if (!accountDetails) {
      res.status(404).json({ message: 'Account not found.', reason: 'accountNotFound' });
      return null;
    }

    if (accountDetails.is_verified) {
      res
        .status(409)
        .json({ message: 'Account is already verified.', reason: 'alreadyVerified' });
      return null;
    }

    if (
      !accountDetails.verification_request_id ||
      accountDetails.failed_attempts >= ACCOUNT_FAILED_ATTEMPTS_LIMIT
    ) {
      await deleteAccountHelper(executor, req, { accountId: accountDetails.account_id });
      res.status(404).json({ message: 'Account not found.', reason: 'accountNotFound' });

      return null;
    }

    const verificationRequestData: FindAccountVerificationRequestServiceReturnType = {
      accountId: accountDetails.account_id,
      email: accountDetails.email,
      displayName: accountDetails.display_name,
      verificationRequestId: accountDetails.verification_request_id,
      verificationToken: accountDetails.verification_token,
      verificationEmailsSent: accountDetails.emails_sent,
      failedVerificationAttempts: accountDetails.failed_attempts,
    };

    return verificationRequestData;
  } catch (err: unknown) {
    console.log(err);

    if (res.headersSent) {
      await logUnexpectedError({
        err,
        req,
        serviceName: findAccountVerificationRequestService.name,
        description: 'Attempted to send two responses.',
      });

      return null;
    }

    res.status(500).json({ message: 'Internal server error.' });
    await logUnexpectedError({
      err,
      req,
      serviceName: findAccountVerificationRequestService.name,
    });

    return null;
  }
}
