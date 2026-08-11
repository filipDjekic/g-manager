package com.game_manager.gm.customer.crm;import java.util.*;import org.springframework.data.jpa.repository.JpaRepository;
interface CustomerCrmTagRepository extends JpaRepository<CustomerCrmTag,UUID>{Optional<CustomerCrmTag> findByNormalizedName(String name);}
