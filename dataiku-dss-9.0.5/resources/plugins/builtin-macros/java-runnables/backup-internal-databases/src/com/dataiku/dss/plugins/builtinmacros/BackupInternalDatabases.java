package com.dataiku.dss.plugins.builtinmacros;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Properties;
import java.util.Set;

import com.dataiku.dip.MiscCodes;
import com.dataiku.dip.exceptions.CodedSQLException;
import com.dataiku.dip.server.SpringUtils;
import org.apache.commons.lang.StringUtils;
import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.joda.time.format.ISODateTimeFormat;

import com.dataiku.dip.dataflow.exec.CodeBasedRecipeDatasetInfoHelper.LocationInfo;
import com.dataiku.dip.db.DSSDBConnectionsManagementService;
import com.dataiku.dip.db.DSSDBConnectionsManagementService.ServerMapping;
import com.dataiku.dip.plugin.BackendClient;
import com.dataiku.dip.plugin.CustomRunnable;
import com.dataiku.dip.plugin.ProgressTracker;
import com.dataiku.dip.plugin.ResultTableDTO;
import com.dataiku.dip.plugin.ResultTableDTO.ResultTableColumnDTO;
import com.dataiku.dip.utils.JSON;
import com.google.common.collect.Sets;
import com.google.gson.JsonObject;
import org.springframework.beans.factory.annotation.Autowired;

public class BackupInternalDatabases implements CustomRunnable {
    private BackendClient backendClient;
    private String projectKey;
    private boolean backupJobs;
    private boolean backupFlow;
    private boolean backupInterests;
    private boolean backupUsage;
    private boolean backupTimelines;
    private String folderRef;

    @Autowired DSSDBConnectionsManagementService internalDBConnectionsService;

    @Override
    public void init(String projectKey, JsonObject config, JsonObject pluginConfig, ProgressTracker progressTracker, BackendClient backendClient) throws Exception {
        Class.forName("org.h2.Driver");

        this.projectKey = projectKey;
        this.backendClient = backendClient;

        this.backupJobs = config.get("jobs").getAsBoolean();
        this.backupFlow = config.get("flow").getAsBoolean();
        this.backupInterests = config.get("interests").getAsBoolean();
        this.backupUsage = config.get("usage").getAsBoolean();
        this.backupTimelines = config.get("timelines").getAsBoolean();
        if (config.get("destination") == null) {
            throw new Exception("No folder specified as destination for the backups");
        }
        this.folderRef = config.get("destination").getAsString();
        SpringUtils.getInstance().autowire(this);
    }

    @Override
    public byte[] run() throws Exception {
        if (!internalDBConnectionsService.isUsingInternalH2()) {
            throw new CodedSQLException(MiscCodes.ERR_MISC_EIDB, "This macro is not working for externally hosted internal databases.");
        }

        LocationInfo folderLocation = JSON.parse(backendClient.executeGet("/dip/api/tintercom/managed-folders/get-info", "projectKey", projectKey, "lookup", folderRef), LocationInfo.class);
        String folderPath = (String) folderLocation.info.get("path");
        if (folderPath == null || folderPath.isEmpty()) {
            throw new Exception("No destination for backup");
        }

        List<ResultTableColumnDTO> resultTableDTOColumns = Arrays.asList(
                new ResultTableColumnDTO("Db", "STRING"),
                new ResultTableColumnDTO("Backuped", "STRING"),
                new ResultTableColumnDTO("File", "STRING")
        );
        List<List<String>> resultTableDTOData = new ArrayList<>();

        String timestamp = ISODateTimeFormat.dateHourMinuteSecondMillis().withZone(DateTimeZone.UTC).print(DateTime.now().getMillis());
        timestamp = timestamp.replace(':', '_');

        if (backupJobs) {
            backupOne("jobs", "jobs", new File(new File(System.getenv("DIP_HOME"), "databases"), "jobs"), timestamp, folderPath, resultTableDTOData, "jobs");
        }
        if (backupFlow) {
            backupOne("flow", "flow", new File(new File(System.getenv("DIP_HOME"), "databases"), "flow_state"), timestamp, folderPath, resultTableDTOData, null);
        }
        if (backupInterests) {
            backupOne("interests", "interests", new File(new File(System.getenv("DIP_HOME"), "databases"), "user_interests"), timestamp, folderPath, resultTableDTOData, null);
        }
        if (backupUsage) {
            backupOne("usage", "usage", new File(new File(System.getenv("DIP_HOME"), "databases"), "dss_usage"), timestamp, folderPath, resultTableDTOData, "dss_usage");
        }
        if (backupTimelines) {
            Set<String> projectKeys = Sets.newTreeSet();
            for (File project : new File(new File(System.getenv("DIP_HOME"), "config"), "projects").listFiles()) {
                if (project.isDirectory() && new File(project, "params.json").exists()) {
                    projectKeys.add(project.getName());
                }
            }
            for (String projectKey : projectKeys) {
                backupOne("timelines." + projectKey, "timelines of " + projectKey, new File(new File(System.getenv("DIP_HOME"), "timelines"), projectKey), timestamp, folderPath, resultTableDTOData, null);
            }
        }

        return JSON.json(new ResultTableDTO("Backup internal databases to " + folderPath, resultTableDTOColumns, resultTableDTOData)).getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public void abort() {
    }

    private void backupOne(String name, String displayName, File dbFile, String timestamp, String folderPath, List<List<String>> resultTableDTOData, String tcpServerName) {
        if (!dbFile.exists() && !new File(dbFile.getParentFile(), dbFile.getName() + ".mv.db").exists() && !new File(dbFile.getParentFile(), dbFile.getName() + ".h2.db").exists()) {
            resultTableDTOData.add(Arrays.asList(displayName, "false", "no db file found"));
            return;
        }
        String jdbcUrl;
        if (StringUtils.isNotBlank(tcpServerName)) {
            try {
                ServerMapping mapping = DSSDBConnectionsManagementService.getMappingForServer(tcpServerName);
                jdbcUrl = "jdbc:h2:tcp://127.0.0.1:" + mapping.port + "/" + mapping.key + ";TRACE_LEVEL_SYSTEM_OUT=2";
            } catch (Exception e) {
                resultTableDTOData.add(Arrays.asList(displayName, "false", "no db server found"));
                return;
            }
        } else {
            jdbcUrl = "jdbc:h2:" + dbFile.getAbsolutePath() + ";TRACE_LEVEL_SYSTEM_OUT=2";
        }
        String zipName = name + "." + timestamp + ".zip";
        try (Connection conn = DriverManager.getDriver(jdbcUrl).connect(jdbcUrl, new Properties())) {
            conn.setAutoCommit(false);
            String targetZipPath = new File(folderPath, zipName).getAbsolutePath();
            try (Statement st = conn.createStatement()) {
                st.execute("backup to '" + targetZipPath + "'");
            }
            resultTableDTOData.add(Arrays.asList(displayName, "true", zipName));
        } catch (SQLException e) {
            resultTableDTOData.add(Arrays.asList(displayName, "false", e.getMessage()));
        }
    }
}

