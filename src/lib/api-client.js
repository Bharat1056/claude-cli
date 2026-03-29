import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = process.env.BASE_URL || "http://localhost:3000";

/**
 * Fetch user data from the backend API using access token
 * @param {string} token - The access token from session
 * @param {boolean} fullUser - If true, returns full user object. If false, returns selective fields
 * @returns {Promise<Object>} User object
 */
export async function fetchUserFromAPI(token, fullUser = false) {
  if (!token) {
    throw new Error("No token provided");
  }

  try {
    const endpoint = fullUser ? "/api/user/me/full" : "/api/user/me";
    const response = await fetch(`${API_BASE_URL}${endpoint}?token=${token}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to fetch user");
    }

    const user = await response.json();
    return user;
  } catch (error) {
    console.error("Error fetching user from API:", error.message);
    throw error;
  }
}
