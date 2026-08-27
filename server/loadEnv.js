// Must be the very first import in server.js. ES module imports are always
// resolved and executed before any of the importing file's own top-level
// code runs — including code positioned textually earlier in that file — so
// a `dotenv.config()` call inside server.js itself runs too late: every
// other module server.js imports (routes/deliveries.js, routes/
// communications.js, etc.) has already been evaluated by then, and any
// module-level `const X = process.env.SOME_VAR` in those files permanently
// captured `undefined`. Loading dotenv here, in a module imported first,
// guarantees process.env is populated before any other import is resolved.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
