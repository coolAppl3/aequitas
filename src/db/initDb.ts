import {
  ACCOUNT_EMAILS_SENT_LIMIT,
  ACCOUNT_FAILED_ATTEMPTS_LIMIT,
  ACCOUNT_FAILED_SIGN_IN_LIMIT,
} from '../util/constants/accountConstants';
import { AUTH_EXTENSIONS_LIMIT } from '../util/constants/authConstants';
import { dbPool } from './db';

export async function initDb(): Promise<void> {
  await createAccountsTable();
  await createAccountVerificationTable();
  await createAccountRecoveryTable();
  await createEmailUpdateTable();
  await createAccountDeletionTable();

  await createAuthSessionsTable();

  await createUnexpectedErrorsTable();

  console.log('Database initialized.');
}

async function createAccountsTable(): Promise<void> {
  try {
    await dbPool.execute(
      `CREATE TABLE IF NOT EXISTS accounts (
        account_id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        public_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
        date_of_birth_timestamp BIGINT UNSIGNED NOT NULL,
        email VARCHAR(254) NOT NULL UNIQUE,
        hashed_password VARCHAR(128) NOT NULL,
        username VARCHAR(60) NOT NULL UNIQUE,
        display_name VARCHAR(60) NOT NULL,
        created_on_timestamp BIGINT UNSIGNED NOT NULL,
        is_verified BOOLEAN NOT NULL,
        failed_sign_in_attempts TINYINT UNSIGNED NOT NULL CHECK(failed_sign_in_attempts <= ?)
      );`,
      [ACCOUNT_FAILED_SIGN_IN_LIMIT]
    );
  } catch (err: unknown) {
    console.log(err);
  }
}

async function createAccountVerificationTable(): Promise<void> {
  try {
    await dbPool.execute(
      `CREATE TABLE IF NOT EXISTS account_verification (
        request_id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        account_id INT UNSIGNED NOT NULL UNIQUE,
        verification_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        emails_sent TINYINT UNSIGNED NOT NULL CHECK(emails_sent <= ?),
        failed_attempts TINYINT UNSIGNED NOT NULL CHECK(failed_attempts <= ?),
        expiry_timestamp BIGINT UNSIGNED NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
      );`,
      [ACCOUNT_EMAILS_SENT_LIMIT, ACCOUNT_FAILED_ATTEMPTS_LIMIT]
    );
  } catch (err: unknown) {
    console.log(err);
  }
}

async function createAccountRecoveryTable(): Promise<void> {
  try {
    await dbPool.execute(
      `CREATE TABLE IF NOT EXISTS account_recovery (
        request_id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        account_id INT UNSIGNED NOT NULL UNIQUE,
        recovery_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        emails_sent TINYINT UNSIGNED NOT NULL CHECK(emails_sent <= ?),
        failed_attempts TINYINT UNSIGNED NOT NULL CHECK(failed_attempts <= ?),
        expiry_timestamp BIGINT UNSIGNED NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
      );`,
      [ACCOUNT_EMAILS_SENT_LIMIT, ACCOUNT_FAILED_ATTEMPTS_LIMIT]
    );
  } catch (err: unknown) {
    console.log(err);
  }
}

async function createEmailUpdateTable(): Promise<void> {
  try {
    await dbPool.execute(
      `CREATE TABLE IF NOT EXISTS email_update (
        request_id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        account_id INT UNSIGNED NOT NULL UNIQUE,
        new_email VARCHAR(254) NOT NULL UNIQUE,
        confirmation_code VARCHAR(10) NOT NULL COLLATE utf8mb4_bin,
        emails_sent TINYINT UNSIGNED NOT NULL CHECK(emails_sent <= ?),
        failed_attempts TINYINT UNSIGNED NOT NULL CHECK(failed_attempts <= ?),
        expiry_timestamp BIGINT UNSIGNED NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
      );`,
      [ACCOUNT_EMAILS_SENT_LIMIT, ACCOUNT_FAILED_ATTEMPTS_LIMIT]
    );
  } catch (err: unknown) {
    console.log(err);
  }
}

async function createAccountDeletionTable(): Promise<void> {
  try {
    await dbPool.execute(
      `CREATE TABLE IF NOT EXISTS account_deletion (
        request_id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        account_id INT UNSIGNED NOT NULL UNIQUE,
        confirmation_code VARCHAR(10) NOT NULL COLLATE utf8mb4_bin,
        emails_sent TINYINT UNSIGNED NOT NULL CHECK(emails_sent <= ?),
        failed_attempts TINYINT UNSIGNED NOT NULL CHECK(failed_attempts <= ?),
        expiry_timestamp BIGINT UNSIGNED NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
      );`,
      [ACCOUNT_EMAILS_SENT_LIMIT, ACCOUNT_FAILED_ATTEMPTS_LIMIT]
    );
  } catch (err: unknown) {
    console.log(err);
  }
}

async function createAuthSessionsTable(): Promise<void> {
  try {
    await dbPool.execute(
      `CREATE TABLE IF NOT EXISTS auth_sessions (
        session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
        account_id INT UNSIGNED NOT NULL,
        created_on_timestamp BIGINT UNSIGNED NOT NULL,
        expiry_timestamp BIGINT UNSIGNED NOT NULL,
        keep_signed_in BOOLEAN NOT NULL,
        extensions_count TINYINT UNSIGNED NOT NULL CHECK(extensions_count <= ?),
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
      );`,
      [AUTH_EXTENSIONS_LIMIT]
    );
  } catch (err: unknown) {
    console.log(err);
  }
}

async function createUnexpectedErrorsTable(): Promise<void> {
  try {
    await dbPool.execute(
      `CREATE TABLE IF NOT EXISTS unexpected_errors (
        error_id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        request_method VARCHAR(10),
        request_path VARCHAR(400),
        service_name VARCHAR(100),
        error_timestamp BIGINT UNSIGNED NOT NULL,
        error_message TEXT,
        error_stack TEXT,
        description VARCHAR(254)
      );`
    );
  } catch (err: unknown) {
    console.log(err);
  }
}
