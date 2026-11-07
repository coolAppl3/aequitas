import { ACCOUNT_FAILED_SIGN_IN_LIMIT } from '../util/constants/accountConstants';
import { dbPool } from './db';

export async function initDb(): Promise<void> {
  createAccountsTable();

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
        username VARCHAR(40) NOT NULL UNIQUE,
        display_name VARCHAR(40) NOT NULL,
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
