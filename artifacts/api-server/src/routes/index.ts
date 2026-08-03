import { Router, type IRouter } from "express";
import healthRouter from "./health";
import telegramRouter from "./telegram";
import sheetsRouter from "./sheets";
import autoReportsRouter from "./autoReports";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/telegram", telegramRouter);
router.use("/sheets", sheetsRouter);
router.use(autoReportsRouter);

export default router;
