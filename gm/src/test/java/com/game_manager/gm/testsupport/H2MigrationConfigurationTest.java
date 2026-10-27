package com.game_manager.gm.testsupport;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class H2MigrationConfigurationTest {
    @Test
    void splitsOnlyTopLevelAlterClausesAndPreservesDataAndConstraintCommas() {
        String sql = "ALTER TABLE entries MODIFY amount DECIMAL(10,2), ADD COLUMN note VARCHAR(50) DEFAULT 'a,b', "
                + "ADD CONSTRAINT uq UNIQUE(amount,note);\nINSERT INTO entries VALUES(1,'a,b');";
        assertThat(H2MigrationConfiguration.splitCompoundAlter(sql)).isEqualTo(
                "ALTER TABLE entries MODIFY amount DECIMAL(10,2);\nALTER TABLE entries  ADD COLUMN note VARCHAR(50) DEFAULT 'a,b';"
                        + "\nALTER TABLE entries  ADD CONSTRAINT uq UNIQUE(amount,note);\nINSERT INTO entries VALUES(1,'a,b');");
    }
}
