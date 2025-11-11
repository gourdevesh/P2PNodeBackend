import prisma from "../config/prismaClient.js";
import { convertBigIntToString } from "../config/convertBigIntToString.js";


export const getUsers = async (req, res) => {
    console.log("Fetching users from the database...");
    try {
        const users = await prisma.users.findMany();
res.json(convertBigIntToString(users)); 

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
