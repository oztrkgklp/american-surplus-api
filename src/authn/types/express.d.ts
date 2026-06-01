import User from "@/authn/models/User";
import DoneeAccount from "@/organization/models/DoneeAccount";
import RequestModel from "@/properties/models/Request";

declare global {
    namespace Express {
        interface Request {
            user: User;
            doneeAccount: DoneeAccount;
            request: RequestModel;
        }
    }
}