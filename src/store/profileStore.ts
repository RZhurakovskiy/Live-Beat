import { create } from 'zustand';
import { getProfile, saveProfile } from '../db/database';
import { UserProfile } from '../types';

interface ProfileState {
  profile: UserProfile | null;
  /** Профиль уже прочитан из базы (даже если его там нет). */
  loaded: boolean;
  loadProfile: () => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
}

/** Стор профиля: вес, возраст и пол для калорий и зон пульса. Хранится в базе. */
export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  loaded: false,

  loadProfile: async () => {
    const profile = await getProfile();
    set({ profile, loaded: true });
  },

  updateProfile: async (profile: UserProfile) => {
    await saveProfile(profile);
    set({ profile });
  },
}));
