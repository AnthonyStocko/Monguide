const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  timezone: 'Z' // les dates sont lues/écrites en UTC
};

const pool = mysql.createPool({
  ...config,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

// Chaque connexion travaille en UTC, quel que soit le fuseau du serveur MySQL.
pool.on('connection', (connection) => connection.query("SET time_zone = '+00:00'"));

/** SELECT : renvoie le tableau de lignes. Les paramètres ? sont échappés (pas d'injection SQL). */
async function rows(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

/** INSERT / UPDATE / DELETE : renvoie { insertId, affectedRows }. */
async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

/** Crée les tables si elles n'existent pas (voir sql/schema.sql). */
async function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  const connection = await mysql.createConnection({ ...config, multipleStatements: true });
  try {
    await connection.query(schema);
  } finally {
    await connection.end();
  }
}

module.exports = { rows, run, initSchema };
