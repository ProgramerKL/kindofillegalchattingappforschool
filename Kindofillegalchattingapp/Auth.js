import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = "https://mrtjssxllkuyomrifoeb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ydGpzc3hsbGt1eW9tcmlmb2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMTE3NDEsImV4cCI6MjA4MzY4Nzc0MX0.9ql1goAQT51_Pvf_-VLNGGKmiyWBEKAOR3FZoWQCBho";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        username: username,
      },
    },
  });

  if (error) {
    console.error("Sign up error:", error.message);
    return { success: false, error: error.message };
  }

  // Check if email confirmation is required
  if (data.user && !data.session) {
    return { success: true, user: data.user, confirmationRequired: true };
  }

  return { success: true, user: data.user };
}

export async function logIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    console.error("Login error:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true, user: data.user, session: data.session };
}

export async function logOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout error:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    console.error("Get user error:", error.message);
    return null;
  }
  return user;
}

export async function getSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) {
    console.error("Get session error:", error.message);
    return null;
  }
  return session;
}

// Leaderboard functions
export async function fetchLeaderboard(opponent) {
  let query = supabase
    .from("leaderboard")
    .select("*")
    .order("time_seconds", { ascending: true });

  if (opponent && opponent !== "all") {
    query = query.eq("opponent", opponent);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Fetch leaderboard error:", error.message);
    return [];
  }
  return data;
}

export async function upsertLeaderboardRecord(userId, username, opponent, timeSeconds) {
  // Check if user already has a record for this opponent
  const { data: existing } = await supabase
    .from("leaderboard")
    .select("id, time_seconds")
    .eq("user_id", userId)
    .eq("opponent", opponent)
    .single();

  if (existing) {
    // Only update if new time is faster
    if (timeSeconds < existing.time_seconds) {
      const { error } = await supabase
        .from("leaderboard")
        .update({ time_seconds: timeSeconds, username: username })
        .eq("id", existing.id);
      if (error) {
        console.error("Update leaderboard error:", error.message);
        return { success: false, error: error.message };
      }
      return { success: true, updated: true };
    }
    return { success: true, updated: false };
  }

  // Insert new record
  const { error } = await supabase.from("leaderboard").insert({
    user_id: userId,
    username: username,
    opponent: opponent,
    time_seconds: timeSeconds,
  });

  if (error) {
    console.error("Insert leaderboard error:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true, updated: true };
}

// Auth state change listener - returns unsubscribe function
export const { data: { subscription: authSubscription } } =
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") {
      console.log("Auth: user signed in");
    }
    if (event === "SIGNED_OUT") {
      console.log("Auth: user signed out");
    }
  });
