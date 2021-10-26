package com.dataiku;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

@SuppressWarnings("squid:S106") // OK to use System.out here
public class CleanH2Timestamps {
    // prepared to use in the migratoin step:
    //   javac -d h2-cleanup CleanH2Timestamps.java
    //   jar cvf h2-cleanup.jar -C h2-cleanup/ .
    // yes this is old-school
    public static void main(String[] args) throws ClassNotFoundException, SQLException {
        String dbName = args[0];
        String dipHome = args[1];
        System.out.println("Cleaning timestamps close to midnight in database " + dbName + " of " + dipHome);

        File dbFile = new File(dipHome, dbName);

        Class.forName("org.h2.Driver");
        String jdbcUrl = "jdbc:h2:" + dbFile.getAbsolutePath();
        System.out.println("Connecting using url " + jdbcUrl);
        try (Connection conn = DriverManager.getDriver(jdbcUrl).connect(jdbcUrl, new Properties())) {
            conn.setAutoCommit(false);
            List<String[]> updatesToRun = new ArrayList<String[]>();
            try (Statement st = conn.createStatement()) {
                ResultSet rs = st.executeQuery("select table_name, column_name from information_schema.columns where type_name = 'TIMESTAMP'"); // NOSONAR
                while (rs.next()) {
                    String tableName = rs.getString(1);
                    String columnName = rs.getString(2);
                    updatesToRun.add(new String[] { tableName, columnName });
                }
            }
            String updateQuery = "update %s set %s=truncate(%s) where extract(hour from %s) = 23 and extract(minute from %s) = 59 and extract(second from %s) = 59";
            System.out.println("Updating " + updatesToRun.size() + " columns");
            try (Statement st = conn.createStatement()) {
                for (String[] updateToRun : updatesToRun) {
                    String tableName = updateToRun[0];
                    String columnName = updateToRun[1];
                    String preparedQuery = String.format(updateQuery, tableName, columnName, columnName, columnName, columnName, columnName);
                    System.out.println("Updating " + columnName + " in " + tableName);
                    st.execute(preparedQuery);
                }
            }
            conn.commit();
        }
    }
}
