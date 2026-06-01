import bcrypt from 'bcrypt';

const saltRounds = process.env.SALT_ROUNDS ? parseInt(process.env.SALT_ROUNDS) : 10;

export const hashPassword = async (password: string): Promise<string> => {
    return await bcrypt.hashSync(password, saltRounds);
};

export const comparePasswords = async (password: string, hash: string): Promise<boolean> => {
    return await bcrypt.compare(password, hash);
};