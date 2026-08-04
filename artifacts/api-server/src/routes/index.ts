import { Router, type IRouter } from "express";
import healthRouter from "./health";
import telegramRouter from "./telegram";
import sheetsRouter from "./sheets";
import autoReportsRouter from "./autoReports";
import mangoRouter from "./mango";
import moizvonkiRouter from "./moizvonki";
import teamRouter from "./team";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/telegram", telegramRouter);
router.use("/sheets", sheetsRouter);
router.use(autoReportsRouter);
router.use("/mango", mangoRouter);
router.use("/moizvonki", moizvonkiRouter);
router.use(teamRouter);

export default router;
