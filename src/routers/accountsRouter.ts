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
  createAccountService,
  createAccountVerificationRequestService,
} from '../services/accountServices';
import { generateCryptoUuid } from '../util/randomGenerator';
import { HASHING_ROUNDS } from '../util/constants/authConstants';
import { sendAccountVerificationEmailService } from '../services/emailServices';

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
      await logUnexpectedError(req, err, 'Attempted to send two responses.');
      return;
    }

    res.status(503).json({ message: 'Internal server error.' });
    await logUnexpectedError(req, err);
  } finally {
    connection?.release();
  }
});
