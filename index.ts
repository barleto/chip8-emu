import express from 'express';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));


app.listen(port, () => {
  console.log(`[LOG] Server is running at http://localhost:${port}`);
});
