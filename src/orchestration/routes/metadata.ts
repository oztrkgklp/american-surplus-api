import { Router } from "express";

import { authenticate } from "@/orchestration/middleware/authenticate";
import { getAll } from "@/orchestration/controllers/metadata";

const router = Router();

router.get('/', authenticate, getAll);

export default router;