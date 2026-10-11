
/* =========================================
   1. SELECT HTML ELEMENTS
========================================= */

const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const searchButton = document.getElementById("search-button");

const statusMessage = document.getElementById("status-message");
const weatherContent = document.getElementById("weather-content");
const welcomeState = document.getElementById("welcome-state");

const locationName = document.getElementById("location-name");
const locationDetails = document.getElementById("location-details");
const updatedTime = document.getElementById("updated-time");

const weatherIcon = document.getElementById("weather-icon");
const weatherDescription = document.getElementById("weather-description");
const temperature = document.getElementById("temperature");
const feelsLike = document.getElementById("feels-like");

const humidity = document.getElementById("humidity");
const windSpeed = document.getElementById("wind-speed");
const precipitation = document.getElementById("precipitation");
const temperatureRange = document.getElementById("temperature-range");

const forecastList = document.getElementById("forecast-list");

/* =========================================
   2. API CONFIGURATION
========================================= */

const GEOCODING_API =
    "https://geocoding-api.open-meteo.com/v1/search";

const WEATHER_API =
    "https://api.open-meteo.com/v1/forecast";

/*
   Abort a request if the API takes too long.
   This prevents the interface from waiting forever.
*/

const REQUEST_TIMEOUT = 12000;

let activeController = null;

/* =========================================
   3. WEATHER CODE DESCRIPTIONS
========================================= */

/*
   Open-Meteo returns WMO weather codes.
   Convert those numbers into readable descriptions
   and matching emoji icons.
*/

function getWeatherInfo(code, isDay = true) {
    if (code === 0) {
        return {
            description: isDay ? "Clear sky" : "Clear night",
            icon: isDay ? "☀️" : "🌙"
        };
    }

    if (code === 1) {
        return {
            description: "Mainly clear",
            icon: isDay ? "🌤️" : "🌙"
        };
    }

    if (code === 2) {
        return {
            description: "Partly cloudy",
            icon: "⛅"
        };
    }

    if (code === 3) {
        return {
            description: "Overcast",
            icon: "☁️"
        };
    }

    if ([45, 48].includes(code)) {
        return {
            description: "Foggy",
            icon: "🌫️"
        };
    }

    if ([51, 53, 55].includes(code)) {
        return {
            description: "Drizzle",
            icon: "🌦️"
        };
    }

    if ([56, 57].includes(code)) {
        return {
            description: "Freezing drizzle",
            icon: "🌧️"
        };
    }

    if ([61, 63, 65].includes(code)) {
        return {
            description: "Rain",
            icon: "🌧️"
        };
    }

    if ([66, 67].includes(code)) {
        return {
            description: "Freezing rain",
            icon: "🌧️"
        };
    }

    if ([71, 73, 75, 77].includes(code)) {
        return {
            description: "Snow",
            icon: "❄️"
        };
    }

    if ([80, 81, 82].includes(code)) {
        return {
            description: "Rain showers",
            icon: "🌦️"
        };
    }

    if ([85, 86].includes(code)) {
        return {
            description: "Snow showers",
            icon: "🌨️"
        };
    }

    if (code === 95) {
        return {
            description: "Thunderstorm",
            icon: "⛈️"
        };
    }

    if ([96, 99].includes(code)) {
        return {
            description: "Thunderstorm with hail",
            icon: "⛈️"
        };
    }

    return {
        description: "Weather unavailable",
        icon: "🌡️"
    };
}

/* =========================================
   4. STATUS MESSAGES
========================================= */

function showStatus(message, type = "") {
    statusMessage.textContent = message;
    statusMessage.className = "status-message";

    if (type) {
        statusMessage.classList.add(type);
    }

    statusMessage.hidden = false;
}

function hideStatus() {
    statusMessage.hidden = true;
    statusMessage.textContent = "";
    statusMessage.className = "status-message";
}

function setLoading(isLoading) {
    searchButton.disabled = isLoading;
    cityInput.disabled = isLoading;

    searchButton.textContent = isLoading
        ? "Searching..."
        : "Search";

    if (isLoading) {
        showStatus("Fetching weather data. Please wait...", "loading");
    }
}

/* =========================================
   5. SAFE FETCH HELPER
========================================= */

async function fetchJSON(url, signal) {
    let response;

    try {
        response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            signal: signal
        });
    } catch (error) {
        if (error.name === "AbortError") {
            throw error;
        }

        throw new Error(
            "Network connection failed. Check your internet and try again."
        );
    }

    if (!response.ok) {
        if (response.status === 429) {
            throw new Error(
                "Too many requests. Please wait a moment and try again."
            );
        }

        if (response.status >= 500) {
            throw new Error(
                "The weather service is temporarily unavailable. Try again later."
            );
        }

        throw new Error(
            "The weather service returned an error (" +
            response.status +
            "). Please try again."
        );
    }

    try {
        return await response.json();
    } catch (error) {
        throw new Error(
            "The server returned invalid JSON. Please try again."
        );
    }
}

/* =========================================
   6. FIND A CITY
========================================= */

async function findCity(city, signal) {
    const parameters = new URLSearchParams({
        name: city,
        count: "10",
        language: "en",
        format: "json"
    });

    const url = GEOCODING_API + "?" + parameters.toString();
    const data = await fetchJSON(url, signal);

    if (!data.results || data.results.length === 0) {
        throw new Error(
            'No matching city found for "' +
            city +
            '". Check the spelling and try again.'
        );
    }

    /*
       If several cities have the same name, prefer an exact
       case-insensitive match. Otherwise use the first result.
    */

    const exactMatch = data.results.find(function (place) {
        return place.name.toLowerCase() === city.toLowerCase();
    });

    return exactMatch || data.results[0];
}

/* =========================================
   7. FETCH WEATHER DATA
========================================= */

async function getWeather(latitude, longitude, signal) {
    const parameters = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),

        current: [
            "temperature_2m",
            "relative_humidity_2m",
            "apparent_temperature",
            "is_day",
            "precipitation",
            "weather_code",
            "wind_speed_10m"
        ].join(","),

        daily: [
            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max"
        ].join(","),

        timezone: "auto",
        forecast_days: "5"
    });

    const url = WEATHER_API + "?" + parameters.toString();
    const data = await fetchJSON(url, signal);

    if (!data.current || !data.daily) {
        throw new Error(
            "Weather data is incomplete. Please try another city."
        );
    }

    return data;
}

/* =========================================
   8. FORMAT VALUES AND DATES
========================================= */

function formatNumber(value, decimals = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }

    return number.toFixed(decimals);
}

function formatDate(dateString, options) {
    /*
       Use a date-only value as a calendar date.
       Avoid shifting the forecast day due to UTC conversion.
    */

    const parts = dateString.split("-").map(Number);

    if (parts.length !== 3 || parts.some(Number.isNaN)) {
        return dateString;
    }

    const date = new Date(parts[0], parts[1] - 1, parts[2]);

    return date.toLocaleDateString(undefined, options);
}

function getCityDetails(place) {
    const parts = [];

    if (place.admin1) {
        parts.push(place.admin1);
    }

    if (place.country) {
        parts.push(place.country);
    }

    return parts.join(", ");
}

/* =========================================
   9. DISPLAY CURRENT WEATHER
========================================= */

function renderCurrentWeather(place, data) {
    const current = data.current;
    const daily = data.daily;

    const info = getWeatherInfo(
        current.weather_code,
        current.is_day === 1
    );

    locationName.textContent = place.name;
    locationDetails.textContent = getCityDetails(place);

    weatherIcon.textContent = info.icon;
    weatherDescription.textContent = info.description;

    temperature.textContent = formatNumber(
        current.temperature_2m
    );

    feelsLike.textContent =
        "Feels like " +
        formatNumber(current.apparent_temperature) +
        "°C";

    humidity.textContent =
        formatNumber(current.relative_humidity_2m) + "%";

    windSpeed.textContent =
        formatNumber(current.wind_speed_10m, 1) + " km/h";

    precipitation.textContent =
        formatNumber(current.precipitation, 1) + " mm";

    const maximum = daily.temperature_2m_max[0];
    const minimum = daily.temperature_2m_min[0];

    temperatureRange.textContent =
        formatNumber(maximum) + "° / " +
        formatNumber(minimum) + "°";

    /*
       Convert the API's local time into a readable label.
    */

    updatedTime.textContent = current.time
        ? "Local time: " +
          current.time.replace("T", " ")
        : "Current conditions";
}

/* =========================================
   10. DISPLAY FIVE-DAY FORECAST
========================================= */

function renderForecast(daily) {
    forecastList.replaceChildren();

    const days = daily.time || [];

    days.forEach(function (date, index) {
        const info = getWeatherInfo(
            daily.weather_code[index]
        );

        const card = document.createElement("article");
        card.className = "forecast-card";

        const day = document.createElement("p");
        day.className = "forecast-day";

        day.textContent = index === 0
            ? "Today"
            : formatDate(date, {
                weekday: "short"
            });

        const icon = document.createElement("div");
        icon.className = "forecast-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = info.icon;

        const description = document.createElement("p");
        description.className = "forecast-description";
        description.textContent = info.description;

        const temperatures = document.createElement("div");
        temperatures.className = "forecast-temperatures";

        const high = document.createElement("span");
        high.textContent =
            formatNumber(daily.temperature_2m_max[index]) + "°";

        const low = document.createElement("span");
        low.className = "forecast-low";
        low.textContent =
            formatNumber(daily.temperature_2m_min[index]) + "°";

        temperatures.append(high, low);

        card.append(
            day,
            icon,
            description,
            temperatures
        );

        /*
           Show rain probability when the API provides it.
        */

        if (
            Array.isArray(daily.precipitation_probability_max) &&
            daily.precipitation_probability_max[index] !== null &&
            daily.precipitation_probability_max[index] !== undefined
        ) {
            const rain = document.createElement("p");
            rain.className = "forecast-rain";

            rain.textContent =
                "Rain " +
                formatNumber(
                    daily.precipitation_probability_max[index]
                ) +
                "%";

            card.appendChild(rain);
        }

        forecastList.appendChild(card);
    });
}

/* =========================================
   11. SEARCH AND UPDATE DASHBOARD
========================================= */

async function searchWeather(city) {
    const query = city.trim();

    if (!query) {
        showStatus("Please enter a city name.", "error");
        cityInput.focus();
        return;
    }

    /*
       Cancel the previous search if the user starts
       another one before the previous request finishes.
    */

    if (activeController) {
        activeController.abort();
    }

    const controller = new AbortController();
    activeController = controller;

    let timeoutId;

    setLoading(true);
    weatherContent.hidden = true;
    welcomeState.hidden = true;

    timeoutId = window.setTimeout(function () {
        controller.abort();
    }, REQUEST_TIMEOUT);

    try {
        const place = await findCity(query, controller.signal);

        const data = await getWeather(
            place.latitude,
            place.longitude,
            controller.signal
        );

        /*
           Only render results for the latest active request.
        */

        if (activeController !== controller) {
            return;
        }

        renderCurrentWeather(place, data);
        renderForecast(data.daily);

        weatherContent.hidden = false;
        welcomeState.hidden = true;

        showStatus(
            "Weather loaded successfully for " + place.name + ".",
            "success"
        );
    } catch (error) {
        if (activeController !== controller) {
            return;
        }

        if (error.name === "AbortError") {
            showStatus(
                "The request took too long or was cancelled. Please try again.",
                "error"
            );
        } else {
            showStatus(
                error.message ||
                "Something went wrong while retrieving the weather.",
                "error"
            );
        }

        /*
           Keep the previous results hidden rather than
           displaying misleading or outdated weather.
        */

        weatherContent.hidden = true;
        welcomeState.hidden = false;
    } finally {
        window.clearTimeout(timeoutId);

        if (activeController === controller) {
            activeController = null;
            setLoading(false);
        }
    }
}

/* =========================================
   12. HANDLE FORM SUBMISSION
========================================= */

searchForm.addEventListener("submit", function (event) {
    event.preventDefault();

    searchWeather(cityInput.value);
});

/* =========================================
   13. INITIALIZE DASHBOARD
========================================= */

function initializeDashboard() {
    welcomeState.hidden = false;
    weatherContent.hidden = true;
    hideStatus();

    /*
       Start with an example city so the dashboard
       displays useful information when it opens.
    */

    searchWeather("Chennai");
}

initializeDashboard();
