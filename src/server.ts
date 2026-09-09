import { createApp } from './app.js';
import { pool } from './db.js';

const port = Number(process.env.PORT ?? 3000);
const app = await createApp(pool);
app.listen(port, '0.0.0.0', () => console.log(`Glowuprizz CRM listening on http://localhost:${port}`));
