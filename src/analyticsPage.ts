import { generateAnalyticsSummary, clearAnalytics, AnalyticsSummary } from "./analytics";

// DOM Elements
const loading = document.getElementById("loading")!;
const noData = document.getElementById("no-data")!;
const dashboardContent = document.getElementById("dashboard-content")!;
const timePeriodSelect = document.getElementById("time-period") as HTMLSelectElement;
const clearDataBtn = document.getElementById("clear-data-btn")!;

// Stat elements
const totalTimeEl = document.getElementById("total-time")!;
const onTaskTimeEl = document.getElementById("on-task-time")!;
const offTaskTimeEl = document.getElementById("off-task-time")!;
const onTaskPercentageEl = document.getElementById("on-task-percentage")!;
const offTaskPercentageEl = document.getElementById("off-task-percentage")!;
const totalAlertsEl = document.getElementById("total-alerts")!;
const avgAlertsPerDayEl = document.getElementById("avg-alerts-per-day")!;
const mostProductiveHourEl = document.getElementById("most-productive-hour")!;
const leastProductiveHourEl = document.getElementById("least-productive-hour")!;

// List containers
const domainsListEl = document.getElementById("domains-list")!;
const distractionsListEl = document.getElementById("distractions-list")!;
const categoriesListEl = document.getElementById("categories-list")!;
const dailyListEl = document.getElementById("daily-list")!;

/**
 * Formats milliseconds to human-readable time
 */
function formatTime(ms: number): string {
  if (ms === 0) return "0m";

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return `${minutes}m`;
  } else if (minutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Formats hour number to 12-hour format
 */
function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

/**
 * Renders the analytics dashboard
 */
async function renderDashboard(daysBack: number = 7) {
  try {
    // Show loading
    loading.classList.remove("hidden");
    noData.classList.add("hidden");
    dashboardContent.classList.add("hidden");

    // Generate analytics summary
    const summary: AnalyticsSummary = await generateAnalyticsSummary(daysBack);

    // Check if we have data
    if (summary.totalTimeTracked === 0) {
      loading.classList.add("hidden");
      noData.classList.remove("hidden");
      return;
    }

    // Hide loading, show content
    loading.classList.add("hidden");
    dashboardContent.classList.remove("hidden");

    // Render overview stats
    totalTimeEl.textContent = formatTime(summary.totalTimeTracked);
    onTaskTimeEl.textContent = formatTime(summary.onTaskTime);
    offTaskTimeEl.textContent = formatTime(summary.offTaskTime);
    onTaskPercentageEl.textContent = `${summary.onTaskPercentage.toFixed(1)}% of total`;
    offTaskPercentageEl.textContent = `${(100 - summary.onTaskPercentage).toFixed(1)}% of total`;
    totalAlertsEl.textContent = summary.alertsThisWeek.toString();
    avgAlertsPerDayEl.textContent = `${summary.averageAlertsPerDay.toFixed(1)} per day`;

    // Render productivity insights
    mostProductiveHourEl.textContent = formatHour(summary.mostProductiveHour);
    leastProductiveHourEl.textContent = formatHour(summary.leastProductiveHour);

    // Render top off-task domains
    domainsListEl.innerHTML = "";
    if (summary.topOffTaskDomains.length === 0) {
      domainsListEl.innerHTML =
        '<p style="color: #888; text-align: center; padding: 20px;">No off-task domains detected yet!</p>';
    } else {
      summary.topOffTaskDomains.forEach((domain, index) => {
        const domainItem = document.createElement("div");
        domainItem.className = "domain-item";

        const domainInfo = document.createElement("div");
        domainInfo.className = "domain-info";

        const domainName = document.createElement("div");
        domainName.className = "domain-name";
        domainName.textContent = `${index + 1}. ${domain.domain}`;

        const domainStats = document.createElement("div");
        domainStats.className = "domain-stats";
        domainStats.textContent = `${domain.visits} visits • Avg ${formatTime(domain.averageTime)}`;

        domainInfo.appendChild(domainName);
        domainInfo.appendChild(domainStats);

        const domainTime = document.createElement("div");
        domainTime.className = "domain-time";
        domainTime.textContent = formatTime(domain.totalTime);

        domainItem.appendChild(domainInfo);
        domainItem.appendChild(domainTime);
        domainsListEl.appendChild(domainItem);
      });
    }

    // Render top distractions
    distractionsListEl.innerHTML = "";
    if (summary.topDistractions.length === 0) {
      distractionsListEl.innerHTML =
        '<p style="color: #888; text-align: center; padding: 20px;">No distractions detected yet!</p>';
    } else {
      summary.topDistractions.forEach((distraction, index) => {
        const distractionItem = document.createElement("div");
        distractionItem.className = "distraction-item";

        const distractionInfo = document.createElement("div");
        distractionInfo.className = "distraction-info";

        const distractionName = document.createElement("div");
        distractionName.className = "distraction-name";
        distractionName.textContent = `${index + 1}. ${distraction.content}`;

        distractionInfo.appendChild(distractionName);

        const distractionCount = document.createElement("div");
        distractionCount.className = "distraction-count";
        distractionCount.textContent = `${distraction.count}x`;

        distractionItem.appendChild(distractionInfo);
        distractionItem.appendChild(distractionCount);
        distractionsListEl.appendChild(distractionItem);
      });
    }

    // Render category breakdown
    categoriesListEl.innerHTML = "";
    if (summary.categoryBreakdown.length === 0) {
      categoriesListEl.innerHTML =
        '<p style="color: #888; text-align: center; padding: 20px;">No category data available yet!</p>';
    } else {
      summary.categoryBreakdown.forEach((category) => {
        const categoryItem = document.createElement("div");
        categoryItem.className = "category-item";

        const categoryInfo = document.createElement("div");
        categoryInfo.className = "category-info";

        const categoryName = document.createElement("div");
        categoryName.className = "category-name";
        categoryName.textContent = category.category;

        const categoryStats = document.createElement("div");
        categoryStats.className = "category-stats";
        categoryStats.textContent = `${category.visits} visits`;

        categoryInfo.appendChild(categoryName);
        categoryInfo.appendChild(categoryStats);

        const categoryTime = document.createElement("div");
        categoryTime.className = "category-time";
        categoryTime.textContent = formatTime(category.time);

        categoryItem.appendChild(categoryInfo);
        categoryItem.appendChild(categoryTime);
        categoriesListEl.appendChild(categoryItem);
      });
    }

    // Render daily stats
    dailyListEl.innerHTML = "";
    if (summary.dailyStats.length === 0) {
      dailyListEl.innerHTML =
        '<p style="color: #888; text-align: center; padding: 20px;">No daily data available yet!</p>';
    } else {
      summary.dailyStats.forEach((day) => {
        const totalDayTime = day.onTaskTime + day.offTaskTime;
        const onTaskPercent = totalDayTime > 0 ? (day.onTaskTime / totalDayTime) * 100 : 0;

        const dailyItem = document.createElement("div");
        dailyItem.className = "daily-item";
        const formattedDate = new Date(day.date).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

        const dailyInfo = document.createElement("div");
        dailyInfo.className = "daily-info";

        const dailyDate = document.createElement("div");
        dailyDate.className = "daily-date";
        dailyDate.textContent = formattedDate;

        const dailyStats = document.createElement("div");
        dailyStats.className = "daily-stats";
        dailyStats.textContent = `${formatTime(day.onTaskTime)} on-task (${onTaskPercent.toFixed(0)}%) • ${formatTime(day.offTaskTime)} off-task • ${day.alertsTriggered} alerts`;

        dailyInfo.appendChild(dailyDate);
        dailyInfo.appendChild(dailyStats);
        dailyItem.appendChild(dailyInfo);
        dailyListEl.appendChild(dailyItem);
      });
    }

    console.log("[Analytics Dashboard] Rendered successfully:", summary);
  } catch (error) {
    console.error("[Analytics Dashboard] Error rendering:", error);
    loading.classList.add("hidden");
    noData.classList.remove("hidden");
  }
}

// Time period selector
timePeriodSelect.addEventListener("change", () => {
  const daysBack = parseInt(timePeriodSelect.value, 10);
  renderDashboard(daysBack);
});

// Clear data button
clearDataBtn.addEventListener("click", async () => {
  if (confirm("Are you sure you want to clear ALL analytics data? This cannot be undone!")) {
    await clearAnalytics();
    alert("All analytics data has been cleared.");
    renderDashboard(7);
  }
});

// Initial render
renderDashboard(7);
