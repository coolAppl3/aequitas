import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { logUnexpectedError } from '../logs/errorLogger';
import { generatePlaceHolders, isSqlError } from '../util/sql/sqlUtils';
import { Request, Response } from 'express';
import { generateCryptoUuid } from '../util/randomGenerator';
import { ACCOUNT_VERIFICATION_WINDOW } from '../util/constants/accountConstants';

async function checkEmailOrUsernameTakenService(
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
      await logUnexpectedError(
        req,
        null,
        checkEmailOrUsernameTakenService.name,
        'Failed to fetch taken status.'
      );

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
      await logUnexpectedError(
        req,
        err,
        checkEmailOrUsernameTakenService.name,
        'Attempted to send two responses.'
      );
      return true;
    }

    res.status(500).json({ message: 'Internal server error.' });
    await logUnexpectedError(req, err, checkEmailOrUsernameTakenService.name);

    return true;
  }
}

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
      await logUnexpectedError(
        req,
        err,
        createAccountService.name,
        'Attempted to send two responses.'
      );
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

async function createAccountVerificationService(
  executor: PoolConnection,
  req: Request,
  res: Response,
  data: {
    accountId: number;
    currentTimestamp: number;
  }
): Promise<boolean> {
  try {
    const { accountId, currentTimestamp } = data;

    const verificationToken: string = generateCryptoUuid();
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
      await logUnexpectedError(
        req,
        err,
        createAccountVerificationService.name,
        'Attempted to send two responses.'
      );
      return false;
    }

    res.status(500).json({ message: 'Internal server error.' });
    await logUnexpectedError(req, err, createAccountVerificationService.name);

    return false;
  }
}
