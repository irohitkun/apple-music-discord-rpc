import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nowPlayingRouter from "./now-playing";
import setupRouter from "./setup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(nowPlayingRouter);
router.use(setupRouter);

export default router;
