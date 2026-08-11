package com.game_manager.gm.customer.crm;
import com.game_manager.gm.common.entity.BaseEntity;import jakarta.persistence.*;import lombok.*;
@Entity @Table(name="customer_crm_tags") @Getter @Setter @NoArgsConstructor
public class CustomerCrmTag extends BaseEntity {@Column(nullable=false,length=60) private String name;@Column(name="normalized_name",nullable=false,length=60,unique=true) private String normalizedName;}
