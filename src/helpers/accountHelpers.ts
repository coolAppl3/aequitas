import { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { logUnexpectedError } from '../logs/errorLogger';
import { Request } from 'express';

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
