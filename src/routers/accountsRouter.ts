import express, { Router, Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { getRequestCookie } from '../util/cookieUtils';
import { undefinedValuesDetected } from '../util/validation/requestValidation';
import {
  isValidDateOfBirthTimestamp,
  isValidDisplayName,
  isValidEmail,
  isValidNewPassword,
  isValidUsername,
} from '../util/validation/accountValidation';
import { dbPool } from '../db/db';
import { logUnexpectedError } from '../logs/errorLogger';
import {
  checkEmailOrUsernameTakenService,
  continueAccountVerificationRequestService,
  createAccountService,
  createAccountVerificationRequestService,
  findAccountVerificationRequestService,
  FindAccountVerificationRequestServiceReturnType,
} from '../services/accountServices';
import { generateCryptoUuid, isValidUuid } from '../util/randomGenerator';
import { HASHING_ROUNDS } from '../util/constants/authConstants';
import { sendAccountVerificationEmailService } from '../services/emailServices';
import { incrementAccountRequestEmailsSentHelper } from '../helpers/accountHelpers';
import { ACCOUNT_EMAILS_SENT_LIMIT } from '../util/constants/accountConstants';

export const accountsRouter: Router = express.Router();

accountsRouter.post('/signUp', async (req: Request, res: Response) => {
  const isSignedIn: boolean = getRequestCookie(req, 'authSessionId') !== null;
  if (isSignedIn) {
    res
      .status(403)
      .json({ message: 'You must sign out before proceeding.', reason: 'signedIn' });
    return;
  }

  type RequestData = {
    dateOfBirthTimestamp: number;
    email: string;
    username: string;
    password: string;
    displayName: string;
  };

  const requestData: RequestData = req.body;

  const expectedKeys: string[] = [
    'dateOfBirthTimestamp',
    'email',
    'username',
    'password',
    'displayName',
  ];
  if (undefinedValuesDetected(requestData, expectedKeys)) {
    res.status(400).json({ message: 'Invalid request data.' });
    return;
  }

  const { dateOfBirthTimestamp, email, username, password, displayName } = requestData;

  if (!isValidDateOfBirthTimestamp(dateOfBirthTimestamp)) {
    res.status(400).json({ message: 'Invalid date of birth.', reason: 'invalidDateOfBirth' });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ message: 'Invalid email.', reason: 'invalidEmail' });
    return;
  }

  if (!isValidUsername(username)) {
    res.status(400).json({ message: 'Invalid username.', reason: 'invalidUsername' });
    return;
  }

  if (!isValidNewPassword(password)) {
    res.status(400).json({ message: 'Invalid password.', reason: 'invalidPassword' });
    return;
  }

  if (!isValidDisplayName(displayName)) {
    res.status(400).json({ message: 'Invalid display name.', reason: 'invalidDisplayName' });
    return;
  }

  if (username === password) {
    res.status(409).json({
      message: `Username and password can't match.`,
      reason: 'passwordMatchesUsername',
    });
    return;
  }

  let connection: PoolConnection | null = null;

  try {
    connection = await dbPool.getConnection();
    await connection.beginTransaction();

    const emailOrUsernameTaken: boolean = await checkEmailOrUsernameTakenService(
      connection,
      req,
      res,
      { email, username }
    );

    if (emailOrUsernameTaken) {
      await connection.rollback();
      return;
    }

    const currentTimestamp: number = Date.now();
    const publicAccountId: string = generateCryptoUuid();
    HASHING_ROUNDS;

    const hashedPassword: string = await bcrypt.hash(password, HASHING_ROUNDS);

    const accountId: number | null = await createAccountService(connection, req, res, {
      publicAccountId,
      dateOfBirthTimestamp,
      email,
      hashedPassword,
      username,
      displayName,
      createdOnTimestamp: currentTimestamp,
    });

    if (!accountId) {
      await connection.rollback();
      return;
    }

    const verificationToken: string = generateCryptoUuid();
    const accountVerificationRequestCreated: boolean =
      await createAccountVerificationRequestService(connection, req, res, {
        accountId,
        currentTimestamp,
        verificationToken,
      });

    if (!accountVerificationRequestCreated) {
      await connection.rollback();
      return;
    }

    await connection.commit();
    res.status(201).json({ publicAccountId });

    await sendAccountVerificationEmailService({
      to: email,
      displayName,
      publicAccountId,
      verificationToken,
    });
  } catch (err: unknown) {
    console.log(err);
    await connection?.rollback();

    if (res.headersSent) {
      await logUnexpectedError({
        err,
        req,
        description: 'Attempted to send two responses.',
      });
      return;
    }

    res.status(500).json({ message: 'Internal server error.' });
    await logUnexpectedError({ err, req });
  } finally {
    connection?.release();
  }
});

accountsRouter.post('/verification/continue', async (req: Request, res: Response) => {
  const isSignedIn: boolean = getRequestCookie(req, 'authSessionId') !== null;
  if (isSignedIn) {
    res
      .status(403)
      .json({ message: 'You must sign out before proceeding.', reason: 'signedIn' });
    return;
  }

  type RequestData = {
    email: string;
  };

  const requestData: RequestData = req.body;

  const expectedKeys: string[] = ['email'];
  if (undefinedValuesDetected(requestData, expectedKeys)) {
    res.status(400).json({ message: 'Invalid request data.' });
    return;
  }

  const { email } = requestData;

  if (!isValidEmail(email)) {
    res.status(400).json({ message: 'Invalid email.', reason: 'invalidEmail' });
    return;
  }

  try {
    const publicAccountId: string | null = await continueAccountVerificationRequestService(
      dbPool,
      req,
      res,
      { email }
    );

    if (!publicAccountId) {
      return;
    }

    res.json({ publicAccountId });
  } catch (err: unknown) {
    console.log(err);

    if (res.headersSent) {
      await logUnexpectedError({
        err,
        req,
        description: 'Attempted to send two responses.',
      });
      return;
    }

    res.status(500).json({ message: 'Internal server error.' });
    await logUnexpectedError({ err, req });
  }
});

accountsRouter.patch('/verification/resendEmail', async (req: Request, res: Response) => {
  const isSignedIn: boolean = getRequestCookie(req, 'authSessionId') !== null;
  if (isSignedIn) {
    res
      .status(403)
      .json({ message: 'You must sign out before proceeding.', reason: 'signedIn' });
    return;
  }

  type RequestData = {
    publicAccountId: string;
  };

  const requestData: RequestData = req.body;

  const expectedKeys: string[] = ['publicAccountId'];
  if (undefinedValuesDetected(requestData, expectedKeys)) {
    res.status(400).json({ message: 'Invalid request data.' });
    return;
  }

  const { publicAccountId } = requestData;

  if (!isValidUuid(publicAccountId)) {
    res.status(400).json({ message: 'Invalid account ID.', reason: 'invalidPublicAccountId' });
    return;
  }

  let connection: PoolConnection | null = null;

  try {
    connection = await dbPool.getConnection();
    await connection.beginTransaction();

    const verificationRequestData: FindAccountVerificationRequestServiceReturnType | null =
      await findAccountVerificationRequestService(connection, req, res, { publicAccountId });

    if (!verificationRequestData) {
      await connection.rollback();
      return;
    }

    const {
      email,
      displayName,
      verificationRequestId,
      verificationToken,
      verificationEmailsSent,
    } = verificationRequestData;

    if (verificationEmailsSent >= ACCOUNT_EMAILS_SENT_LIMIT) {
      res.status(403).json({
        message: `Sent verification emails limit reached.`,
        reason: 'emailsSentLimitReached',
      });
      return;
    }

    const incremented: boolean = await incrementAccountRequestEmailsSentHelper(
      connection,
      req,
      {
        tableName: 'account_verification',
        requestId: verificationRequestId,
      }
    );

    if (!incremented) {
      await connection.rollback();
      res.status(500).json({ message: 'Internal server error.' });

      return;
    }

    await connection.commit();
    res.json({});

    await sendAccountVerificationEmailService({
      to: email,
      displayName: displayName,
      publicAccountId: publicAccountId,
      verificationToken: verificationToken,
    });
  } catch (err: unknown) {
    console.log(err);
    await connection?.rollback();

    if (res.headersSent) {
      await logUnexpectedError({
        err,
        req,
        description: 'Attempted to send two responses.',
      });
      return;
    }

    res.status(500).json({ message: 'Internal server error.' });
    await logUnexpectedError({ err, req });
  } finally {
    connection?.release();
  }
});
