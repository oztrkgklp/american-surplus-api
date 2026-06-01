import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";
import config from "@/config/envvars";

const credential = new ClientSecretCredential(
    config.azure.tenant_id!,
    config.azure.client_id!,
    config.azure.client_secret!
);

export const getGraphClient = async () => {
    const token = await credential.getToken("https://graph.microsoft.com/.default");

    return Client.init({
        authProvider: (done) => {
            done(null, token?.token || "");
        },
    });
};
