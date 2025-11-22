import demoDataset from './demo_dataset.json';
import type { DemoDataset } from './demoDatasetTypes';

const dataset = demoDataset as DemoDataset;

export interface DemoUserInfo {
    id: string;
    original_client_id: string;
    name: string;
}

// Extract demo users from dataset
export const demoUsers: DemoUserInfo[] = dataset.map(user => ({
    id: user.id,
    original_client_id: user.original_client_id,
    name: user.name || `Пользователь ${user.original_client_id}`,
}));

// Helper to find user by ID
export function findDemoUserById(userId: string): typeof dataset[0] | undefined {
    return dataset.find(u => u.id === userId || u.original_client_id === userId);
}
