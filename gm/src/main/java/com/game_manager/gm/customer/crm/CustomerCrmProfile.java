package com.game_manager.gm.customer.crm;
import com.game_manager.gm.common.entity.BaseEntity;import jakarta.persistence.*;import java.util.*;import lombok.*;import org.hibernate.annotations.JdbcTypeCode;import org.hibernate.type.SqlTypes;
@Entity @Table(name="customer_crm_profiles") @Getter @Setter @NoArgsConstructor
public class CustomerCrmProfile extends BaseEntity {@JdbcTypeCode(SqlTypes.CHAR) @Column(name="customer_id",nullable=false,length=36,unique=true) private UUID customerId;
 @ManyToMany @JoinTable(name="customer_crm_profile_tags",joinColumns=@JoinColumn(name="profile_id"),inverseJoinColumns=@JoinColumn(name="tag_id")) private Set<CustomerCrmTag> tags=new LinkedHashSet<>();}
