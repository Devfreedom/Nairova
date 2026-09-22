const express = require("express");
const {register, login} = require("../controllers/authControllers")


const router = express.Router();

router.use(authenticate);

//Admin and User view 
router.get()