const db = require('./../models');
const fs = require('fs').promises;
const { createJWT } = require('../lib/jwt');
// const {deleteFiles} = require('');
const { hash, match } = require('./../helper/hashing');
const transporter = require('./../helper/transporter');
const handlebars = require('handlebars');
const { log } = require('console');
const respondHandler = require('../utils/resnpondHandler');
const { Op, where } = require('sequelize');

module.exports = {
    findAllUsers: async () => {
        try {
            return await db.user.findAll()
        } catch (error) {
            return error
        }
    },

    findId: async (id) => {
        try {
            return await db.user.findOne({
                where: { id }
            })
        } catch (error) {
            return error
        }
    },

    findReferral: async (referral) => {
        try {
            return await db.user.findOne({
                where: { referral }
            })
        } catch (error) {
            return error
        }
    },

    findEmail: async (email) => {
        try {
            return await db.user.findOne({
                where: { email }
            })
        } catch (error) {
            return error
        }
    },

    findUsername: async (username) => {
        try {
            return await db.user.findOne({
                where: { username }
            })
        } catch (error) {
            return error
        }
    },

    verifyUser: async (id) => {
        try {
            return db.user.update({
                isVerified: "verified"
            }, {
                where: { id }
            })
        } catch (error) {
            return error
        }
    },

    createUser: async (userData) => {
        try {
            const { username, email, password, phone_number, referral } = userData
            return db.user.create({ username: username, email: email, password: password, phone_number: phone_number, referral_code: referral })
        } catch (error) {
            return error
        }
    },

    userLogin: async (email, password) => {
        const account = await db.user.findOne({
            where: { email }
        })
        if (!account) throw { status: 401, message: "Account was not found!" };
        const hashMatch = await match(password, account.dataValues.password)
        if (!hashMatch) throw { status: 401, message: "Incorrect Password" }
        const token = await createJWT(
            {
                id: account.dataValues.id,
                role: account.dataValues.role,
                store_branch_id: account.dataValues.store_branch_id
            },
            "1d"
        )
        return {
            isError: false,
            message: "login successful",
            data: {
                id: account.dataValues.id,
                username: account.dataValues.username,
                email: account.dataValues.email,
                role: account.dataValues.role,
                jwt: token,
                profile_picture: account.dataValues.profile_picture,
                store_branch_id: account.dataValues.store_branch_id
            }
        }
    },

    registerUser: async (user) => {
        try {
            const { username, email, password, phone_number, referral, referralValid } = user
            let newUser;
            const existingAccount = await db.user.findOne({
                where: { username }
            })
            console.log(existingAccount);
            const existingEmail = await db.user.findOne({ where: { email } })
            if (existingAccount) {
                return {
                    isError: true,
                    message: "Username has already been taken",
                }
            }
            if (existingEmail) {
                return {
                    isError: true,
                    message: "email has already been taken",
                }
            }
            const hashedPassword = await hash(password);
            const newReferral = Math.round(Math.random() * 1e9);
            const userData = {
                username: username,
                email: email,
                password: hashedPassword,
                phone_number,
                referral_code: newReferral
            }
            if (referralValid === false) {
                newUser = await db.user.create(userData)
            } else if (referralValid) {
                newUser = await db.user.create(userData)
                const getCoupon = await db.coupon.findOne({ where: { id: 1 } })
                const newUserCoupon = await db.owned_coupon.create({ isValid: "true", user_id: newUser.id, coupon_id: 1, coupon_value: getCoupon.amount, coupon_name: getCoupon.name })
                const validReferralUser = await db.user.findOne({ where: { referral_code: referral } })
                const oldUserCoupon = await db.owned_coupon.create({ isValid: "true", user_id: validReferralUser.id, coupon_id: 1, coupon_value: getCoupon.amount, coupon_name: getCoupon.name })
            }
            console.log("masuk 150>>>>");
            console.log(newUser);
            const token = createJWT(
                {
                    id: newUser.dataValues.id,
                    role: newUser.dataValues.role,
                }, '12h')
            console.log("jwt created 156");
            const readTemplate = await fs.readFile('./src/public/user-verification.html', 'utf-8');
            console.log("fs read file 158");
            const compiledTemplate = await handlebars.compile(readTemplate);
            console.log("compiled 160");
            const newTemplate = compiledTemplate({ username, token })
            console.log(username);
            console.log(token);
            console.log("masuk user service>>>>>>>");
            await transporter.sendMail({
                to: `aryosetyotama27@gmail.com`,
                subject: "Verification",
                html: newTemplate
            });
            console.log("selesai>>>>>>>>>>>");
            return {
                isError: false,
                message: "User account succesfully verified",
            }
        } catch (error) {
            console.log(error);
            return error
        }
    },

    checkReferralService: async (params) => {
        try {
            const { getRef } = params
            const checkRef = await db.user.findOne({ where: { referral_code: getRef } })
            if (checkRef === "") {
                return { isError: true, message: "Please Input The Referral Code" }
            }
            else if (checkRef === null) {
                return { isError: true, message: "Oops, Referral Code Not Found, Please Try Again!" }
            }
            return await db.user.findOne({ where: { referral_code: getRef } })
        } catch (error) {
            return error
        }
    },

    createBranchManager: async (req) => {
        const { email, username, phone_number, password, store_branch_id, birthdate, gender } = req.body;
        const usedEmail = await db.user.findOne({
            where: { email }
        });
        const usedUsername = await db.user.findOne({
            where: { username }
        });
        if (usedEmail || usedUsername) throw { status: 401, message: "Username or Email has already been taken" }
        const hashedPassword = await hash(password);
        const userData = {
            username,
            email,
            password: hashedPassword,
            phone_number,
            isVerified: "verified",
            role: "admin",
            birthdate,
            gender,
            store_branch_id
        }
        await db.user.create(userData)
        return {
            isError: false,
            message: "Branch admin created"
        }
    },

    editBranchManager: async (req) => {
        try {
            const { email, store_branch_id } = req.body;
            const account = await db.user.findOne({
                where: { email }
            });
            console.log(store_branch_id, email);
            console.log(account.dataValues.store_branch_id);
            if (!account) throw { status: 401, message: "Error, account was not found!" };
            if (store_branch_id == account.dataValues.store_branch_id) throw { error: 401, message: "Admin was already assigned to the designated branch" };
            await db.user.update({ store_branch_id }, { where: { email } })

            await db.user.findAll().then((res) => { console.log(res); })
            return {
                isError: false,
                message: "Admin assigned to new branch"
            }
        } catch (error) {
            console.log(error);
            return error
        }
    },

    getFilteredAdmin: async (req) => {
        try {
            console.log(req.query);
            const { username, branch, page } = req.query;
            const limit = 6;
            const offset = (page - 1) * limit;
            let whereCondition = {};
            whereCondition.role = "admin"
            if (username) {
                whereCondition.username = {
                    [Op.like]: `%${username}%`,
                }
            }
            if (branch) {
                whereCondition.store_branch_id = branch
            }
            const filteredAdmins = await db.user.findAll({
                where: whereCondition,
                order: [["updatedAt", "DESC"]],
                limit,
                offset,
                include: [{ model: db.store_branch }]
            });
            console.log(filteredAdmins);
            const totalRecords = await db.user.count({ where: whereCondition });
            const maxPages = Math.ceil(totalRecords / limit);
            return {
                filteredAdmins,
                maxPages
            };
        } catch (error) {
            return error;
        }
    }
}