// export interface AuthContext {
//   type: "apiKey" | "session";
//   organizationId: string;
//   projectId?: string;
//   apiKey?: {
//     rawKey: string;
//     prefix: string;
//     name: string;
//     id: string;
//   }
//   userId?: string;
// }

export type AuthContext =
  | {
      type: "apiKey";
      organizationId: string;
      projectId?: string;
      apiKey: {
        rawKey: string;
        prefix: string;
        name: string;
        id: string;
      };
    }
  | {
      type: "session";
      organizationId: string;
      userId: string;
      memberId?: string;
      name?: string;
      email?: string;
    };
