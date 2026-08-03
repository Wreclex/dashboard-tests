import { Router, type IRouter } from "express";
import healthRouter from "./health";
import telegramRouter from "./telegram";
import sheetsRouter from "./sheets";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/telegram", telegramRouter);
router.use("/sheets", sheetsRouter);

export default router;
