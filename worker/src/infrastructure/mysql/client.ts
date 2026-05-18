import mysql, {
  type Pool,
  type PoolConnection,
  type QueryResult,
  type ResultSetHeader,
} from 'mysql2/promise';

export function createMysqlPool(): Pool {
  return mysql.createPool({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'sdd_monitor',
    password: process.env.MYSQL_PASSWORD ?? 'sdd_monitor',
    database: process.env.MYSQL_DATABASE ?? 'sdd_monitor',
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE ?? 5),
    timezone: 'Z',
  });
}

export async function withTransaction<T>(
  pool: Pool,
  callback: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function asResultSetHeader(result: QueryResult): ResultSetHeader {
  return result as ResultSetHeader;
}
