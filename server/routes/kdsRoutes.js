const express = require("express");
const { kdsApiKey } = require("../middleware/kdsApiKey");
const ctrl = require("../controllers/kdsController");

const router = express.Router();

router.use(kdsApiKey);

router.post("/orders", ctrl.create);
router.post("/partner-orders", ctrl.partnerCreate);
router.get("/orders", ctrl.list);
router.get("/orders/:id", ctrl.getOne);
router.post("/orders/:id/add-items", ctrl.addItems);
router.post("/orders/:id/note", ctrl.addNote);
router.post("/orders/:id/cancel", ctrl.cancel);
router.patch("/orders/:id/status", ctrl.setStatus);
router.post("/prune", ctrl.pruneOld);

module.exports = router;
