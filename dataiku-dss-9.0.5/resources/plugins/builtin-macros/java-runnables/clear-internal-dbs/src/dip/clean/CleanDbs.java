package dip.clean;

import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import com.dataiku.dip.server.services.TransactionService;
import com.dataiku.dip.sql.SQLUtils.SQLTable;
import com.dataiku.dip.sql.queries.DeleteQueryBuilder;
import com.dataiku.dip.sql.queries.ExpressionBuilder;
import com.dataiku.dip.sql.queries.SelectQueryBuilder;
import com.dataiku.dip.transactions.ifaces.Transaction;
import org.apache.log4j.Logger;
import org.joda.time.DateTime;
import org.springframework.beans.factory.annotation.Autowired;

import com.dataiku.dip.db.DSSDBConnection;
import com.dataiku.dip.plugin.BackendClient;
import com.dataiku.dip.plugin.CustomRunnable;
import com.dataiku.dip.plugin.ProgressTracker;
import com.dataiku.dip.plugin.ResultTableDTO;
import com.dataiku.dip.plugin.ResultTableDTO.ResultTableColumnDTO;
import com.dataiku.dip.server.SpringUtils;
import com.dataiku.dip.server.services.ProjectsService;
import com.dataiku.dip.server.services.ReadOnlyJobsInternalDB;
import com.dataiku.dip.server.services.ReadWriteJobsInternalDB;
import com.dataiku.dip.timelines.ProjectTimelineBehavior;
import com.dataiku.dip.timelines.TimelinesInternalDB;
import com.dataiku.dip.utils.JSON;
import com.google.common.collect.Lists;
import com.google.gson.JsonObject;

public class CleanDbs implements CustomRunnable {
    private static final ExpressionBuilder.ExpressionBuilderFactory EBF = new ExpressionBuilder.ExpressionBuilderFactory();
    private String projectKey;
    private boolean deleteJobs;
    private boolean deleteChecks;
    private boolean deleteMetrics;
    private boolean deleteScenarios;
    private boolean deleteTimelines;
    private int maxAge;

    private @Autowired ReadWriteJobsInternalDB jobsDB;
    private @Autowired TimelinesInternalDB timelinesDB;

    public CleanDbs() {
    }

    @Override
    public void init(String projectKey, JsonObject config, JsonObject pluginConfig, ProgressTracker progressTracker, BackendClient backendClient) throws Exception {
        this.projectKey = projectKey;
        if (config.get("allProjects").getAsBoolean()) {
            this.projectKey = null;
        }
        this.deleteJobs = config.get("jobs").getAsBoolean();
        this.deleteChecks = config.get("checks").getAsBoolean();
        this.deleteMetrics = config.get("metrics").getAsBoolean();
        this.deleteScenarios = config.get("scenarios").getAsBoolean();
        this.deleteTimelines = config.get("timelines").getAsBoolean();
        this.maxAge = config.get("age").getAsInt();

        SpringUtils.getInstance().autowire(this);
    }

    @Override
    public byte[] run() throws Exception {
        // compute the limit for timestamp of rows to keep
        long maxTimestamp = DateTime.now().minusDays(maxAge).getMillis();

        List<ReportElement> deletions = Lists.newArrayList();

        try (DSSDBConnection conn = jobsDB.acquireConnection()) {
            if (deleteJobs) {
                deletions.add(executeOneDeleteStatement(
                        conn,
                        createDeleteQueryBuilder(ReadOnlyJobsInternalDB.JOB_TABLE, ReadOnlyJobsInternalDB.JOB_PROJECT_KEY_COLUMN)
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_END_COLUMN).gt(0))
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_END_COLUMN).lt(maxTimestamp))
                                .toSql(jobsDB.getDialect()),
                        "jobs"));
            }
            if (deleteChecks) {
                deletions.add(executeOneDeleteStatement(
                        conn,
                        createDeleteQueryBuilder(ReadOnlyJobsInternalDB.CHECKS_LAST_TABLE, ReadOnlyJobsInternalDB.PROJECT_KEY_COLUMN)
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_COMPUTE_COLUMN).lt(maxTimestamp))
                                .toSql(jobsDB.getDialect()),
                        "last checks"));
                deletions.add(executeOneDeleteStatement(
                        conn,
                        DeleteQueryBuilder.deleteFrom(jobsDB.resolveTable(ReadOnlyJobsInternalDB.CHECKS_HISTORY_TABLE))
                                .where(EBF.col(ReadOnlyJobsInternalDB.SESSION_INDEX_COLUMN).in(buildSessionIndicesSqlQueryExpr(ReadOnlyJobsInternalDB.CHECKS_SESSIONS_TABLE, maxTimestamp)))
                                .toSql(jobsDB.getDialect()),
                        "checks history"));
                deletions.add(executeOneDeleteStatement(
                        conn,
                        createDeleteQueryBuilder(ReadOnlyJobsInternalDB.CHECKS_SESSIONS_TABLE, ReadOnlyJobsInternalDB.PROJECT_KEY_COLUMN)
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_COMPUTE_COLUMN).lt(maxTimestamp))
                                .toSql(jobsDB.getDialect()),
                        "checks sessions"));
            }
            if (deleteMetrics) {
                deletions.add(executeOneDeleteStatement(
                        conn,
                        createDeleteQueryBuilder(ReadOnlyJobsInternalDB.METRICS_LAST_TABLE, ReadOnlyJobsInternalDB.PROJECT_KEY_COLUMN)
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_COMPUTE_COLUMN).lt(maxTimestamp))
                                .toSql(jobsDB.getDialect()),
                        "last metrics"));
                deletions.add(executeOneDeleteStatement(
                        conn,
                        DeleteQueryBuilder.deleteFrom(jobsDB.resolveTable(ReadOnlyJobsInternalDB.METRICS_HISTORY_TABLE))
                                .where(EBF.col(ReadOnlyJobsInternalDB.SESSION_INDEX_COLUMN).in(buildSessionIndicesSqlQueryExpr(ReadOnlyJobsInternalDB.METRICS_SESSIONS_TABLE, maxTimestamp)))
                                .toSql(jobsDB.getDialect()),
                        "metrics history"));
                deletions.add(executeOneDeleteStatement(
                        conn,
                        createDeleteQueryBuilder(ReadOnlyJobsInternalDB.METRICS_SESSIONS_TABLE, ReadOnlyJobsInternalDB.PROJECT_KEY_COLUMN)
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_COMPUTE_COLUMN).lt(maxTimestamp))
                                .toSql(jobsDB.getDialect()),
                        "metrics sessions"));
            }
            if (deleteScenarios) {
                deletions.add(executeOneDeleteStatement(
                        conn,
                        createDeleteQueryBuilder(ReadOnlyJobsInternalDB.SCENARIO_RUNS_TABLE, ReadOnlyJobsInternalDB.SCENARIO_PROJECT_KEY_COLUMN)
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_END_COLUMN).gt(0))
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_END_COLUMN).lt(maxTimestamp))
                                .toSql(jobsDB.getDialect()),
                        "scenario runs"));
                deletions.add(executeOneDeleteStatement(
                        conn,
                        createDeleteQueryBuilder(ReadOnlyJobsInternalDB.STEP_RUNS_TABLE, ReadOnlyJobsInternalDB.SCENARIO_PROJECT_KEY_COLUMN)
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_END_COLUMN).gt(0))
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_END_COLUMN).lt(maxTimestamp))
                                .toSql(jobsDB.getDialect()),
                        "scenario steps"));
                deletions.add(executeOneDeleteStatement(
                        conn,
                        createDeleteQueryBuilder(ReadOnlyJobsInternalDB.TRIGGER_FIRES_TABLE, ReadOnlyJobsInternalDB.SCENARIO_PROJECT_KEY_COLUMN)
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_TRIGGER_COLUMN).lt(maxTimestamp))
                                .toSql(jobsDB.getDialect()),
                        "triggers"));
                deletions.add(executeOneDeleteStatement(
                        conn,
                        createDeleteQueryBuilder(ReadOnlyJobsInternalDB.FLOW_OBJECT_ACTION_TABLE, ReadOnlyJobsInternalDB.PROJECT_KEY_COLUMN)
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_END_COLUMN).gt(0))
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_END_COLUMN).lt(maxTimestamp))
                                .toSql(jobsDB.getDialect()),
                        "last object changes"));
                deletions.add(executeOneDeleteStatement(
                        conn,
                        createDeleteQueryBuilder(ReadOnlyJobsInternalDB.FLOW_OBJECT_ACTION_HISTORY_TABLE, ReadOnlyJobsInternalDB.PROJECT_KEY_COLUMN)
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_END_COLUMN).gt(0))
                                .where(EBF.col(ReadOnlyJobsInternalDB.TIME_END_COLUMN).lt(maxTimestamp))
                                .toSql(jobsDB.getDialect()),
                        "object changes history"));
            }
        }

        if (deleteTimelines) {
            List<String> timelineProjectKeysToClear;
            if (projectKey == null) {
                TransactionService transactionService = SpringUtils.getBean(TransactionService.class);
                try (Transaction t = transactionService.beginRead()) {
                    timelineProjectKeysToClear = SpringUtils.getBean(ProjectsService.class).listKeys();
                }
            } else {
                timelineProjectKeysToClear = Lists.newArrayList(projectKey);
            }
            for (String pkey: timelineProjectKeysToClear) {
                logger.info("Cleaning timeline for project " + pkey);
                ProjectTimelineBehavior behavior = timelinesDB.getDao(pkey);
                try (DSSDBConnection conn = timelinesDB.acquireConnection(pkey)) {
                    deletions.add(executeOneDeleteStatement(
                            conn,
                            createDeleteQueryBuilder(behavior.getResolvedTable(), ProjectTimelineBehavior.PROJECT_KEY_COLUMN, pkey)
                            .where(EBF.col(ProjectTimelineBehavior.ITEM_TIME_COLUMN).lt(maxTimestamp)).toSql(behavior.getDialect()),
                            "timeline (" + pkey + ")"));
                }
            }
        }

        List<ResultTableColumnDTO> resultTableDTOColumns = Arrays.asList(
                new ResultTableColumnDTO("Deleted", "STRING"),
                new ResultTableColumnDTO("Count", "STRING")
                );
        List<List<String>> resultTableDTOData = new ArrayList<>();

        for (ReportElement deletion : deletions) {
            resultTableDTOData.add(Arrays.asList(deletion.name, String.valueOf(deletion.deleted)));
        }
        return JSON.json(new ResultTableDTO("Clear internal database", resultTableDTOColumns, resultTableDTOData)).getBytes(StandardCharsets.UTF_8);
    }

    private ExpressionBuilder buildSessionIndicesSqlQueryExpr(String sessionsTable, long maxTimestamp) {
        SelectQueryBuilder checkSessionIndices = new SelectQueryBuilder();
        checkSessionIndices.from(jobsDB.resolveTable(sessionsTable), sessionsTable);
        checkSessionIndices.select(ReadOnlyJobsInternalDB.SESSION_INDEX_COLUMN);
        if (projectKey != null) {
            checkSessionIndices.where(EBF.col(ReadOnlyJobsInternalDB.PROJECT_KEY_COLUMN).eq(projectKey));
        }
        checkSessionIndices.where(EBF.col(ReadOnlyJobsInternalDB.TIME_COMPUTE_COLUMN).lt(maxTimestamp));
        return EBF.expr(checkSessionIndices.toSQL(jobsDB.getDialect()));
    }

    private DeleteQueryBuilder createDeleteQueryBuilder(SQLTable table, String projectKeyColumnName, String projectKeyValue) {
        DeleteQueryBuilder deleteQueryBuilder = DeleteQueryBuilder.deleteFrom(table);
        if (projectKeyValue != null) {
            deleteQueryBuilder.where(EBF.col(projectKeyColumnName).nullUnsafeEq(projectKeyValue));
        }
        return deleteQueryBuilder;
    }

    private DeleteQueryBuilder createDeleteQueryBuilder(String tableName, String projectKeyColumnName) {
        return createDeleteQueryBuilder(jobsDB.resolveTable(tableName), projectKeyColumnName, projectKey);
    }

    @Override
    public void abort() {
    }

    private ReportElement executeOneDeleteStatement(DSSDBConnection conn, String sql, String name) throws SQLException {
        try (Statement st = conn.createStatement()) {
            logger.info("Starting cleanup statement " + sql);
            int deleted = st.executeUpdate(sql);
            logger.info("Cleanup statement done, deleted=" + deleted);
            conn.commit();
            return new ReportElement(name, deleted);
        }
    }

    private class ReportElement {
        final String name;
        final int deleted;

        ReportElement(String name, int deleted) {
            this.name = name;
            this.deleted = deleted;
        }
    }

    private static Logger logger = Logger.getLogger("dku.clean.dbs");
}