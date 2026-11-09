export type Role = 'buyer' | 'creative' | 'head';

export interface User {
  id: number;
  login: string;
  full_name: string;
  roles: Role[];
  is_active: boolean;
}

export interface DemoUser {
  id: number;
  full_name: string;
  roles: Role[];
}
