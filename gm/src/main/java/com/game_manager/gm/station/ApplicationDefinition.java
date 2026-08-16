package com.game_manager.gm.station;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "application_definitions")
@Getter @Setter
public class ApplicationDefinition extends BaseEntity {
    @Column(nullable = false, unique = true, length = 60) private String code;
    @Column(nullable = false, length = 120) private String name;
    @Enumerated(EnumType.STRING)
    @Column(name = "application_type", nullable = false, length = 20) private ApplicationType type;
    @Column(name = "executable_path", nullable = false, length = 500) private String executablePath;
    @Column(length = 255) private String publisher;
    @Column(name = "publisher_certificate_thumbprint", length = 64) private String publisherCertificateThumbprint;
    @Column(name = "executable_sha256", length = 64) private String executableSha256;
    @Column(name = "minimum_file_version", length = 50) private String minimumFileVersion;
    @Column(name = "default_arguments", length = 1000) private String defaultArguments;
    @Column(nullable = false) private boolean active = true;
}
