package com.game_manager.gm.customer.crm;import java.util.*;import org.springframework.data.jpa.repository.JpaRepository;
interface CustomerCrmProfileRepository extends JpaRepository<CustomerCrmProfile,UUID>{Optional<CustomerCrmProfile> findByCustomerId(UUID customerId);}
